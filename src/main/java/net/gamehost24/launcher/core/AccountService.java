package net.gamehost24.launcher.core;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import jmccc.microsoft.MicrosoftAuthenticator;
import jmccc.microsoft.entity.MicrosoftSession;
import org.to2mbn.jmccc.auth.AuthInfo;
import org.to2mbn.jmccc.auth.AuthenticationException;
import org.to2mbn.jmccc.auth.Authenticator;

import javax.crypto.*;
import javax.crypto.spec.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

/**
 * Manages multiple Minecraft accounts (Microsoft and offline).
 *
 * Security:
 * - Access tokens are stored AES-256-GCM encrypted.
 * - The encryption key is stored in <appData>/security/accounts.key (a random 256-bit key).
 * - Tokens are NEVER written to logs.
 * - Plaintext tokens only live in-memory as {@link StoredAccount} objects.
 *
 * JMCCC integration:
 * - {@link #getActiveAuthenticator()} returns a JMCCC {@link Authenticator} that
 *   builds an {@link AuthInfo} from the active account (real access token + UUID).
 */
public class AccountService {

    // ─── Singleton ────────────────────────────────────────────────────────────

    private static AccountService INSTANCE;

    public static synchronized AccountService init(File appDataDir) {
        if (INSTANCE == null) INSTANCE = new AccountService(appDataDir);
        return INSTANCE;
    }

    public static AccountService getInstance() { return INSTANCE; }

    // ─── StoredAccount ────────────────────────────────────────────────────────

    public static class StoredAccount {
        public String username;
        public String uuid;
        public String type;   // "microsoft" | "offline"
        public boolean active;

        // These fields are only set in-memory.
        // When persisting, the token is AES-GCM encrypted and written to encryptedToken.
        transient String accessToken;
        transient MicrosoftSession session;

        // On-disk encrypted representations (base64 of IV+ciphertext)
        String encryptedToken;
        String encryptedSession;  // full MicrosoftSession JSON (for token refresh)

        /** Safe copy for the frontend (no tokens). */
        public Map<String, Object> toPublic() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("username", username);
            m.put("uuid",     uuid);
            m.put("type",     type);
            m.put("active",   active);
            return m;
        }
    }

    // ─── Fields ───────────────────────────────────────────────────────────────

    private final File                    keyFile;
    private final File                    storeFile;
    private final Gson                    gson = new GsonBuilder().setPrettyPrinting().create();
    private       SecretKey               encKey;

    // Live list of accounts (mutable)
    private final List<StoredAccount> accounts = new CopyOnWriteArrayList<>();

    // ─── Constructor ──────────────────────────────────────────────────────────

    private AccountService(File appDataDir) {
        File secDir = new File(appDataDir, "security");
        secDir.mkdirs();
        this.keyFile   = new File(secDir, "accounts.key");
        this.storeFile = new File(secDir, "accounts.enc");

        try {
            this.encKey = loadOrCreateKey();
            load();
        } catch (Exception e) {
            // If load fails (corrupt file, first run, etc.) start fresh
            LogService log = LogService.getInstance();
            if (log != null) log.warn("AccountService", null, "Failed to load accounts: " + e.getMessage());
            accounts.clear();
        }
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    /** All accounts as frontend-safe maps (no tokens). */
    public List<Map<String, Object>> getAccountsPublic() {
        return accounts.stream().map(StoredAccount::toPublic).collect(Collectors.toList());
    }

    /** Active account or null. */
    public StoredAccount getActiveAccount() {
        return accounts.stream().filter(a -> a.active).findFirst().orElse(null);
    }

    /**
     * Returns a JMCCC {@link Authenticator} for the active account.
     * Throws {@link AuthenticationException} if no account is active or token missing.
     */
    public Authenticator getActiveAuthenticator() {
        StoredAccount acc = getActiveAccount();
        if (acc == null) {
            return () -> { throw new AuthenticationException("No active account — please log in first"); };
        }

        if ("offline".equals(acc.type)) {
            return () -> new AuthInfo(
                acc.username,
                UUID.randomUUID().toString(),
                UUID.nameUUIDFromBytes(("OfflinePlayer:" + acc.username).getBytes(StandardCharsets.UTF_8)),
                Collections.emptyMap(),
                "offline"
            );
        }

        // Microsoft account — try token refresh first if we have a session, else use stored token
        final StoredAccount finalAcc = acc;
        return () -> {
            // 1. Try silent token refresh via the stored MicrosoftSession (OAuth2 refresh token)
            if (finalAcc.session != null) {
                try {
                    // MicrosoftAuthenticator.session() uses the stored session's refresh token.
                    // If the refresh token is also expired it will call the verification consumer —
                    // we throw there so the exception propagates and we fall through to the stored token.
                    MicrosoftAuthenticator refreshed = MicrosoftAuthenticator.session(
                        finalAcc.session,
                        verification -> { throw new RuntimeException("Re-authentication required — refresh token expired"); }
                    );
                    AuthInfo info = refreshed.auth();
                    // Persist refreshed token
                    finalAcc.accessToken    = info.getToken();
                    finalAcc.encryptedToken = encrypt(info.getToken());
                    try {
                        MicrosoftSession newSession = refreshed.getSession();
                        if (newSession != null) {
                            finalAcc.session = newSession;
                            finalAcc.encryptedSession = encrypt(gson.toJson(newSession));
                        }
                    } catch (Exception ignored) {}
                    try { save(); } catch (Exception ignored) {}
                    log("Token silently refreshed for " + finalAcc.username);
                    return info;
                } catch (Exception refreshEx) {
                    log("Silent refresh failed (" + refreshEx.getMessage() + ") — using stored token");
                }
            }
            // 2. Fall back to stored access token
            if (finalAcc.accessToken == null || finalAcc.accessToken.isBlank()) {
                throw new AuthenticationException(
                    "Account-Token abgelaufen. Bitte melde dich erneut an (Settings → Konten).");
            }
            try {
                UUID uuid = parseMinecraftUUID(finalAcc.uuid);
                return new AuthInfo(finalAcc.username, finalAcc.accessToken, uuid,
                    Collections.emptyMap(), "msa");
            } catch (Exception e) {
                throw new AuthenticationException("Failed to build auth info: " + e.getMessage());
            }
        };
    }

    /** Add or update a Microsoft account from the auth result. */
    public void addOrUpdateMicrosoftAccount(String username, String uuid, String accessToken, MicrosoftSession session) throws Exception {
        // Deactivate all others
        accounts.forEach(a -> a.active = false);

        // Find existing or create new
        StoredAccount acc = accounts.stream()
            .filter(a -> a.uuid.equals(uuid))
            .findFirst()
            .orElseGet(() -> {
                StoredAccount n = new StoredAccount();
                accounts.add(n);
                return n;
            });

        acc.username       = username;
        acc.uuid           = uuid;
        acc.type           = "microsoft";
        acc.active         = true;
        acc.accessToken    = accessToken;
        acc.encryptedToken = encrypt(accessToken);

        if (session != null) {
            acc.session          = session;
            acc.encryptedSession = encrypt(gson.toJson(session));
        }

        save();
        log("Account added/updated: " + username + " (" + uuid + ")");
    }

    /** Add an offline account. */
    public void addOfflineAccount(String username) throws Exception {
        accounts.forEach(a -> a.active = false);

        String offlineUuid = UUID.nameUUIDFromBytes(
            ("OfflinePlayer:" + username).getBytes(StandardCharsets.UTF_8)).toString();

        StoredAccount acc = accounts.stream()
            .filter(a -> a.uuid.equals(offlineUuid))
            .findFirst()
            .orElseGet(() -> {
                StoredAccount n = new StoredAccount();
                accounts.add(n);
                return n;
            });

        acc.username    = username;
        acc.uuid        = offlineUuid;
        acc.type        = "offline";
        acc.active      = true;
        acc.accessToken = null;
        acc.encryptedToken = null;

        save();
        log("Offline account added: " + username);
    }

    /** Switch active account by UUID. */
    public boolean setActiveAccount(String uuid) throws Exception {
        boolean found = false;
        for (StoredAccount a : accounts) {
            a.active = a.uuid.equals(uuid);
            if (a.active) found = true;
        }
        if (found) { save(); log("Active account switched to: " + uuid); }
        return found;
    }

    /** Remove account by UUID. */
    public boolean removeAccount(String uuid) throws Exception {
        boolean removed = accounts.removeIf(a -> a.uuid.equals(uuid));
        if (removed) {
            // If removed was active, make the first remaining account active
            if (accounts.stream().noneMatch(a -> a.active) && !accounts.isEmpty()) {
                accounts.get(0).active = true;
            }
            save();
            log("Account removed: " + uuid);
        }
        return removed;
    }

    /** Remove all accounts. */
    public void clearAll() {
        accounts.clear();
        try { save(); } catch (Exception ignored) {}
        log("All accounts cleared");
    }

    // ─── Persistence ─────────────────────────────────────────────────────────

    private void save() throws Exception {
        // Re-encrypt tokens/sessions from in-memory transient fields
        for (StoredAccount a : accounts) {
            if (a.accessToken != null && !a.accessToken.isBlank()) {
                a.encryptedToken = encrypt(a.accessToken);
            }
            if (a.session != null) {
                a.encryptedSession = encrypt(gson.toJson(a.session));
            }
        }

        // Serialize without transient fields
        String json = gson.toJson(accounts);
        byte[] encrypted = encryptBytes(json.getBytes(StandardCharsets.UTF_8));
        Files.write(storeFile.toPath(), encrypted, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
    }

    private void load() throws Exception {
        if (!storeFile.exists()) return;
        byte[] data = Files.readAllBytes(storeFile.toPath());
        String json = new String(decryptBytes(data), StandardCharsets.UTF_8);

        List<StoredAccount> loaded = gson.fromJson(json, new TypeToken<List<StoredAccount>>(){}.getType());
        if (loaded == null) return;

        for (StoredAccount a : loaded) {
            // Decrypt token back to memory
            if (a.encryptedToken != null && !a.encryptedToken.isBlank()) {
                try { a.accessToken = decrypt(a.encryptedToken); }
                catch (Exception e) { a.accessToken = null; }
            }
            // Decrypt session back to memory
            if (a.encryptedSession != null && !a.encryptedSession.isBlank()) {
                try { a.session = gson.fromJson(decrypt(a.encryptedSession), MicrosoftSession.class); }
                catch (Exception e) { a.session = null; }
            }
        }
        accounts.clear();
        accounts.addAll(loaded);
    }

    // ─── Encryption — AES-256-GCM ────────────────────────────────────────────

    private static final String ALGO = "AES/GCM/NoPadding";
    private static final int GCM_IV_LEN  = 12;
    private static final int GCM_TAG_LEN = 128;

    private SecretKey loadOrCreateKey() throws Exception {
        if (keyFile.exists()) {
            byte[] keyBytes = Files.readAllBytes(keyFile.toPath());
            return new SecretKeySpec(keyBytes, "AES");
        }
        // Generate new 256-bit key
        KeyGenerator kg = KeyGenerator.getInstance("AES");
        kg.init(256, new SecureRandom());
        SecretKey key = kg.generateKey();
        Files.write(keyFile.toPath(), key.getEncoded(),
            StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        // Best-effort: restrict read permission on Unix
        keyFile.setReadable(false, false);
        keyFile.setReadable(true, true);
        return key;
    }

    /** Encrypt a String → base64(IV + ciphertext). */
    private String encrypt(String plain) throws Exception {
        byte[] encrypted = encryptBytes(plain.getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(encrypted);
    }

    /** Decrypt a base64(IV + ciphertext) → String. */
    private String decrypt(String base64) throws Exception {
        byte[] data = Base64.getDecoder().decode(base64);
        return new String(decryptBytes(data), StandardCharsets.UTF_8);
    }

    private byte[] encryptBytes(byte[] plain) throws Exception {
        byte[] iv = new byte[GCM_IV_LEN];
        new SecureRandom().nextBytes(iv);
        Cipher cipher = Cipher.getInstance(ALGO);
        cipher.init(Cipher.ENCRYPT_MODE, encKey, new GCMParameterSpec(GCM_TAG_LEN, iv));
        byte[] ciphertext = cipher.doFinal(plain);
        byte[] result = new byte[GCM_IV_LEN + ciphertext.length];
        System.arraycopy(iv, 0, result, 0, GCM_IV_LEN);
        System.arraycopy(ciphertext, 0, result, GCM_IV_LEN, ciphertext.length);
        return result;
    }

    private byte[] decryptBytes(byte[] data) throws Exception {
        byte[] iv = Arrays.copyOfRange(data, 0, GCM_IV_LEN);
        byte[] ct = Arrays.copyOfRange(data, GCM_IV_LEN, data.length);
        Cipher cipher = Cipher.getInstance(ALGO);
        cipher.init(Cipher.DECRYPT_MODE, encKey, new GCMParameterSpec(GCM_TAG_LEN, iv));
        return cipher.doFinal(ct);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Parse a Minecraft UUID (with or without dashes).
     * The Mojang profile API returns UUIDs without dashes.
     */
    private static UUID parseMinecraftUUID(String id) {
        if (id == null || id.isBlank()) throw new IllegalArgumentException("Empty UUID");
        String s = id.replace("-", "");
        if (s.length() != 32) throw new IllegalArgumentException("Invalid UUID: " + id);
        return UUID.fromString(
            s.substring(0,  8) + "-" +
            s.substring(8,  12) + "-" +
            s.substring(12, 16) + "-" +
            s.substring(16, 20) + "-" +
            s.substring(20)
        );
    }

    private void log(String msg) {
        LogService ls = LogService.getInstance();
        if (ls != null) ls.info("AccountService", msg);
    }
}

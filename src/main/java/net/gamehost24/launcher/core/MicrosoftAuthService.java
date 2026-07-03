package net.gamehost24.launcher.core;

import jmccc.microsoft.MicrosoftAuthenticator;
import jmccc.microsoft.entity.MicrosoftSession;
import jmccc.microsoft.entity.MicrosoftVerification;
import org.to2mbn.jmccc.auth.AuthInfo;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Microsoft device-code login via JMCCC MicrosoftAuthenticator.
 *
 * Uses the JMCCC built-in client ID (d51b460a-0b8a-4696-af4d-690f7ba7f5b6).
 * No Azure registration or configuration required.
 */
public class MicrosoftAuthService {

    // ─── Singleton ────────────────────────────────────────────────────────────

    private static final MicrosoftAuthService INSTANCE = new MicrosoftAuthService();
    public static MicrosoftAuthService getInstance() { return INSTANCE; }

    // ─── Auth state ───────────────────────────────────────────────────────────

    private volatile boolean              done           = false;
    private volatile Map<String, Object>  currentAccount = null;
    private volatile String               pollError      = null;

    // ─── Public API ───────────────────────────────────────────────────────────

    /**
     * Starts the Microsoft device-code login flow.
     * Returns {userCode, verificationUri, expiresIn, message} once the device code is ready.
     * Call {@link #poll()} every 5 s afterwards to check for completion.
     */
    public Map<String, Object> start() throws Exception {
        done          = false;
        currentAccount = null;
        pollError     = null;

        LogService log = LogService.getInstance();
        if (log != null) log.info("MicrosoftAuth", null, "Starting Microsoft login flow");

        final MicrosoftVerification[] verifHolder = { null };
        final Exception[]             errorHolder  = { null };
        final CountDownLatch          codeLatch    = new CountDownLatch(1);

        Executors.newSingleThreadExecutor().submit(() -> {
            try {
                // JMCCC handles the full OAuth flow with its built-in client ID
                MicrosoftAuthenticator auth = MicrosoftAuthenticator.login(verification -> {
                    verifHolder[0] = verification;
                    codeLatch.countDown(); // unblock start() once device code is ready
                });

                // login() returned → user completed authentication
                AuthInfo info    = auth.auth();
                MicrosoftSession session = auth.getSession();

                if (log != null) log.info("MicrosoftAuth", null,
                    "Login success — username=" + info.getUsername() + ", uuid=" + info.getUUID());

                AccountService accounts = AccountService.getInstance();
                if (accounts != null) {
                    try {
                        accounts.addOrUpdateMicrosoftAccount(
                            info.getUsername(),
                            info.getUUID().toString(),
                            info.getToken(),
                            session
                        );
                    } catch (Exception e) {
                        if (log != null) log.warn("MicrosoftAuth", null,
                            "Could not persist account: " + e.getMessage());
                    }
                }

                Map<String, Object> acc = new LinkedHashMap<>();
                acc.put("username", info.getUsername());
                acc.put("uuid",     info.getUUID().toString());
                acc.put("type",     "microsoft");
                currentAccount = acc;

            } catch (Exception e) {
                if (log != null) log.error("MicrosoftAuth", null, "Login failed: " + e.getMessage());
                if (verifHolder[0] == null) {
                    // Failed before device code was issued — unblock start() with the error
                    errorHolder[0] = e;
                    codeLatch.countDown();
                } else {
                    // Failed after device code (e.g. user cancelled or timed out)
                    pollError = friendlyError(e);
                }
            } finally {
                done = true;
            }
        });

        // Wait up to 30 s for the device code
        if (!codeLatch.await(30, TimeUnit.SECONDS)) {
            done = true;
            throw new Exception("Timed out waiting for Microsoft to issue a device code. Check your internet connection.");
        }

        if (errorHolder[0] != null) {
            done = true;
            throw new Exception(friendlyError(errorHolder[0]));
        }

        MicrosoftVerification v = verifHolder[0];
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userCode",        v.userCode);
        result.put("verificationUri", v.verificationUri);
        result.put("expiresIn",       900);
        result.put("message",         v.message != null ? v.message : "");
        return result;
    }

    /**
     * Returns {done, account?, error?}.
     * The frontend should poll this after calling start().
     */
    public Map<String, Object> poll() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("done", done);
        if (done) {
            if (currentAccount != null) result.put("account", currentAccount);
            if (pollError      != null) result.put("error",   pollError);
        }
        return result;
    }

    public void clearAccount() {
        done          = false;
        currentAccount = null;
        pollError     = null;
    }

    // ─── Error formatting ─────────────────────────────────────────────────────

    private static String friendlyError(Exception e) {
        String msg = e.getMessage();
        if (msg == null) return "Microsoft login failed (unknown error)";
        if (msg.contains("does not have a Minecraft") || msg.contains("does not own")) {
            return "This Microsoft account does not own Minecraft: Java Edition.";
        }
        if (msg.contains("XErr=2148916233")) return "This Microsoft account has no Xbox account associated with it.";
        if (msg.contains("XErr=2148916235")) return "Xbox Live is not available in your region.";
        if (msg.contains("XErr=2148916238")) return "Child accounts require parental consent to play online.";
        return "Microsoft login failed: " + msg;
    }
}

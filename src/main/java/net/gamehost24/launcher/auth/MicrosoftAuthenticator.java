package net.gamehost24.launcher.auth;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.reflect.TypeToken;
import org.to2mbn.jmccc.auth.AuthInfo;
import org.to2mbn.jmccc.auth.Authenticator;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Microsoft OAuth 2.0 Device Code Flow for Minecraft Authentication.
 * Flow: Microsoft OAuth → Xbox Live → XSTS → Minecraft Services
 */
public class MicrosoftAuthenticator implements Authenticator {

    // Microsoft Azure App Client ID (Public Client for Minecraft)
    // This is the official Minecraft Launcher client ID
    private static final String CLIENT_ID = "00000000402b5328";
    
    private static final String MICROSOFT_DEVICE_CODE_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
    private static final String MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
    private static final String XBOX_LIVE_AUTH_URL = "https://user.auth.xboxlive.com/user/authenticate";
    private static final String XSTS_AUTH_URL = "https://xsts.auth.xboxlive.com/xsts/authorize";
    private static final String MINECRAFT_AUTH_URL = "https://api.minecraftservices.com/authentication/login_with_xbox";
    private static final String MINECRAFT_PROFILE_URL = "https://api.minecraftservices.com/minecraft/profile";
    private static final String MINECRAFT_OWNERSHIP_URL = "https://api.minecraftservices.com/entitlements/mcstore";

    private static final String SCOPE = "XboxLive.signin offline_access";

    private static final String APP_DATA_DIR;
    static {
        String os = System.getProperty("os.name").toLowerCase();
        if (os.contains("win")) {
            APP_DATA_DIR = System.getenv("APPDATA") + "\\AtlasCraft";
        } else {
            APP_DATA_DIR = System.getProperty("user.home") + "/.atlascraft";
        }
        new File(APP_DATA_DIR).mkdirs();
    }

    private static final File ACCOUNTS_FILE = new File(APP_DATA_DIR, "accounts.json");
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private List<MinecraftAccount> accounts = new ArrayList<>();
    private MinecraftAccount currentAccount = null;

    public MicrosoftAuthenticator() {
        loadAccounts();
    }

    // ==================== DEVICE CODE FLOW ====================

    /**
     * Start Device Code Flow - returns code for user to enter at microsoft.com/link
     */
    public DeviceCodeResponse startDeviceCodeFlow() throws IOException {
        String params = "client_id=" + URLEncoder.encode(CLIENT_ID, "UTF-8") +
                        "&scope=" + URLEncoder.encode(SCOPE, "UTF-8");

        String response = postForm(MICROSOFT_DEVICE_CODE_URL, params);
        JsonObject json = JsonParser.parseString(response).getAsJsonObject();

        return new DeviceCodeResponse(
            json.get("device_code").getAsString(),
            json.get("user_code").getAsString(),
            json.get("verification_uri").getAsString(),
            json.get("expires_in").getAsInt(),
            json.get("interval").getAsInt()
        );
    }

    /**
     * Poll for token after user enters code
     */
    public CompletableFuture<MinecraftAccount> pollForToken(DeviceCodeResponse deviceCode) {
        CompletableFuture<MinecraftAccount> future = new CompletableFuture<>();
        ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor();

        final long expiresAt = System.currentTimeMillis() + (deviceCode.expiresIn * 1000L);
        final int[] attempts = {0};

        Runnable pollTask = new Runnable() {
            @Override
            public void run() {
                if (System.currentTimeMillis() > expiresAt) {
                    future.completeExceptionally(new Exception("Device code expired"));
                    executor.shutdown();
                    return;
                }

                try {
                    String params = "grant_type=urn:ietf:params:oauth:grant-type:device_code" +
                                    "&client_id=" + URLEncoder.encode(CLIENT_ID, "UTF-8") +
                                    "&device_code=" + URLEncoder.encode(deviceCode.deviceCode, "UTF-8");

                    String response = postForm(MICROSOFT_TOKEN_URL, params);
                    JsonObject json = JsonParser.parseString(response).getAsJsonObject();

                    if (json.has("error")) {
                        String error = json.get("error").getAsString();
                        if ("authorization_pending".equals(error)) {
                            // User hasn't entered code yet, keep polling
                            attempts[0]++;
                            executor.schedule(this, deviceCode.interval, TimeUnit.SECONDS);
                            return;
                        } else if ("slow_down".equals(error)) {
                            // Poll slower
                            executor.schedule(this, deviceCode.interval + 5, TimeUnit.SECONDS);
                            return;
                        } else {
                            future.completeExceptionally(new Exception("Auth error: " + error));
                            executor.shutdown();
                            return;
                        }
                    }

                    // Success! We have Microsoft tokens
                    String accessToken = json.get("access_token").getAsString();
                    String refreshToken = json.has("refresh_token") ? json.get("refresh_token").getAsString() : null;

                    // Continue auth flow
                    MinecraftAccount account = completeAuthentication(accessToken, refreshToken);
                    future.complete(account);
                    executor.shutdown();

                } catch (Exception e) {
                    future.completeExceptionally(e);
                    executor.shutdown();
                }
            }
        };

        executor.schedule(pollTask, deviceCode.interval, TimeUnit.SECONDS);
        return future;
    }

    /**
     * Complete the full authentication flow
     */
    private MinecraftAccount completeAuthentication(String msAccessToken, String msRefreshToken) throws IOException {
        // Step 1: Xbox Live Token
        System.out.println("[Auth] Getting Xbox Live token...");
        JsonObject xblResponse = authenticateWithXboxLive(msAccessToken);
        String xblToken = xblResponse.get("Token").getAsString();
        String userHash = xblResponse.getAsJsonObject("DisplayClaims")
                                     .getAsJsonArray("xui")
                                     .get(0).getAsJsonObject()
                                     .get("uhs").getAsString();

        // Step 2: XSTS Token
        System.out.println("[Auth] Getting XSTS token...");
        JsonObject xstsResponse = authenticateWithXSTS(xblToken);
        String xstsToken = xstsResponse.get("Token").getAsString();

        // Step 3: Minecraft Token
        System.out.println("[Auth] Getting Minecraft token...");
        JsonObject mcResponse = authenticateWithMinecraft(userHash, xstsToken);
        String mcAccessToken = mcResponse.get("access_token").getAsString();

        // Step 4: Check ownership
        System.out.println("[Auth] Checking game ownership...");
        if (!ownsMinecraft(mcAccessToken)) {
            throw new IOException("This Microsoft account does not own Minecraft Java Edition");
        }

        // Step 5: Get Profile
        System.out.println("[Auth] Getting Minecraft profile...");
        JsonObject profileResponse = getMinecraftProfile(mcAccessToken);
        String uuid = profileResponse.get("id").getAsString();
        String username = profileResponse.get("name").getAsString();
        String skinUrl = null;
        if (profileResponse.has("skins") && profileResponse.getAsJsonArray("skins").size() > 0) {
            skinUrl = profileResponse.getAsJsonArray("skins").get(0).getAsJsonObject().get("url").getAsString();
        }

        // Create account
        MinecraftAccount account = new MinecraftAccount();
        account.uuid = uuid;
        account.username = username;
        account.accessToken = mcAccessToken;
        account.refreshToken = msRefreshToken;
        account.expiresAt = System.currentTimeMillis() + (86400 * 1000); // 24h
        account.skinUrl = skinUrl;

        // Save
        addAccount(account);
        System.out.println("[Auth] Successfully logged in as " + username);

        return account;
    }

    private JsonObject authenticateWithXboxLive(String msAccessToken) throws IOException {
        JsonObject payload = new JsonObject();
        payload.addProperty("RelyingParty", "http://auth.xboxlive.com");
        payload.addProperty("TokenType", "JWT");
        
        JsonObject properties = new JsonObject();
        properties.addProperty("AuthMethod", "RPS");
        properties.addProperty("SiteName", "user.auth.xboxlive.com");
        properties.addProperty("RpsTicket", "d=" + msAccessToken);
        payload.add("Properties", properties);

        String response = postJson(XBOX_LIVE_AUTH_URL, payload.toString());
        return JsonParser.parseString(response).getAsJsonObject();
    }

    private JsonObject authenticateWithXSTS(String xblToken) throws IOException {
        JsonObject payload = new JsonObject();
        payload.addProperty("RelyingParty", "rp://api.minecraftservices.com/");
        payload.addProperty("TokenType", "JWT");
        
        JsonObject properties = new JsonObject();
        properties.addProperty("SandboxId", "RETAIL");
        com.google.gson.JsonArray tokens = new com.google.gson.JsonArray();
        tokens.add(xblToken);
        properties.add("UserTokens", tokens);
        payload.add("Properties", properties);

        String response = postJson(XSTS_AUTH_URL, payload.toString());
        return JsonParser.parseString(response).getAsJsonObject();
    }

    private JsonObject authenticateWithMinecraft(String userHash, String xstsToken) throws IOException {
        JsonObject payload = new JsonObject();
        payload.addProperty("identityToken", "XBL3.0 x=" + userHash + ";" + xstsToken);

        String response = postJson(MINECRAFT_AUTH_URL, payload.toString());
        return JsonParser.parseString(response).getAsJsonObject();
    }

    private boolean ownsMinecraft(String mcAccessToken) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(MINECRAFT_OWNERSHIP_URL).openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("Authorization", "Bearer " + mcAccessToken);
        
        if (conn.getResponseCode() != 200) {
            return false;
        }

        String response = readResponse(conn);
        JsonObject json = JsonParser.parseString(response).getAsJsonObject();
        
        // Check if they have product_minecraft or game_minecraft
        if (json.has("items")) {
            for (var item : json.getAsJsonArray("items")) {
                String name = item.getAsJsonObject().get("name").getAsString();
                if (name.contains("minecraft") || name.contains("product_minecraft")) {
                    return true;
                }
            }
        }
        
        // Also try checking profile (if profile exists, they own the game)
        try {
            getMinecraftProfile(mcAccessToken);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private JsonObject getMinecraftProfile(String mcAccessToken) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(MINECRAFT_PROFILE_URL).openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("Authorization", "Bearer " + mcAccessToken);
        
        if (conn.getResponseCode() != 200) {
            throw new IOException("Failed to get Minecraft profile: " + conn.getResponseCode());
        }

        String response = readResponse(conn);
        return JsonParser.parseString(response).getAsJsonObject();
    }

    // ==================== TOKEN REFRESH ====================

    public MinecraftAccount refreshAccount(MinecraftAccount account) throws IOException {
        if (account.refreshToken == null) {
            throw new IOException("No refresh token available");
        }

        String params = "grant_type=refresh_token" +
                        "&client_id=" + URLEncoder.encode(CLIENT_ID, "UTF-8") +
                        "&refresh_token=" + URLEncoder.encode(account.refreshToken, "UTF-8") +
                        "&scope=" + URLEncoder.encode(SCOPE, "UTF-8");

        String response = postForm(MICROSOFT_TOKEN_URL, params);
        JsonObject json = JsonParser.parseString(response).getAsJsonObject();

        if (json.has("error")) {
            throw new IOException("Refresh failed: " + json.get("error").getAsString());
        }

        String newAccessToken = json.get("access_token").getAsString();
        String newRefreshToken = json.has("refresh_token") ? json.get("refresh_token").getAsString() : account.refreshToken;

        return completeAuthentication(newAccessToken, newRefreshToken);
    }

    // ==================== ACCOUNT MANAGEMENT ====================

    public void loadAccounts() {
        if (!ACCOUNTS_FILE.exists()) {
            accounts = new ArrayList<>();
            return;
        }
        try (Reader reader = new FileReader(ACCOUNTS_FILE)) {
            AccountsData data = GSON.fromJson(reader, AccountsData.class);
            if (data != null) {
                accounts = data.accounts != null ? data.accounts : new ArrayList<>();
                if (data.selectedUuid != null) {
                    currentAccount = accounts.stream()
                        .filter(a -> a.uuid.equals(data.selectedUuid))
                        .findFirst()
                        .orElse(null);
                }
            }
        } catch (Exception e) {
            System.err.println("Failed to load accounts: " + e.getMessage());
            accounts = new ArrayList<>();
        }
    }

    public void saveAccounts() {
        try (Writer writer = new FileWriter(ACCOUNTS_FILE)) {
            AccountsData data = new AccountsData();
            data.accounts = accounts;
            data.selectedUuid = currentAccount != null ? currentAccount.uuid : null;
            GSON.toJson(data, writer);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public void addAccount(MinecraftAccount account) {
        // Remove existing account with same UUID
        accounts.removeIf(a -> a.uuid.equals(account.uuid));
        accounts.add(account);
        currentAccount = account;
        saveAccounts();
    }

    public void removeAccount(String uuid) {
        accounts.removeIf(a -> a.uuid.equals(uuid));
        if (currentAccount != null && currentAccount.uuid.equals(uuid)) {
            currentAccount = accounts.isEmpty() ? null : accounts.get(0);
        }
        saveAccounts();
    }

    public void selectAccount(String uuid) {
        currentAccount = accounts.stream()
            .filter(a -> a.uuid.equals(uuid))
            .findFirst()
            .orElse(null);
        saveAccounts();
    }

    public List<MinecraftAccount> getAccounts() {
        return new ArrayList<>(accounts);
    }

    public MinecraftAccount getCurrentAccount() {
        return currentAccount;
    }

    // ==================== JMCCC AUTHENTICATOR INTERFACE ====================

    @Override
    public AuthInfo auth() throws org.to2mbn.jmccc.auth.AuthenticationException {
        if (currentAccount == null) {
            throw new org.to2mbn.jmccc.auth.AuthenticationException("No account selected");
        }

        // Check if token needs refresh
        if (System.currentTimeMillis() > currentAccount.expiresAt - 300000) { // 5 min buffer
            try {
                System.out.println("[Auth] Token expired, refreshing...");
                currentAccount = refreshAccount(currentAccount);
            } catch (IOException e) {
                throw new org.to2mbn.jmccc.auth.AuthenticationException("Token refresh failed: " + e.getMessage());
            }
        }

        // Format UUID with dashes
        String formattedUuid = currentAccount.uuid;
        if (!formattedUuid.contains("-") && formattedUuid.length() == 32) {
            formattedUuid = formattedUuid.substring(0, 8) + "-" +
                           formattedUuid.substring(8, 12) + "-" +
                           formattedUuid.substring(12, 16) + "-" +
                           formattedUuid.substring(16, 20) + "-" +
                           formattedUuid.substring(20);
        }

        return new AuthInfo(
            currentAccount.username,
            currentAccount.accessToken,
            UUID.fromString(formattedUuid),
            Collections.emptyMap(),
            "msa"
        );
    }

    // ==================== HTTP HELPERS ====================

    private String postForm(String urlStr, String params) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        conn.setDoOutput(true);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(params.getBytes(StandardCharsets.UTF_8));
        }

        return readResponse(conn);
    }

    private String postJson(String urlStr, String json) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Accept", "application/json");
        conn.setDoOutput(true);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(json.getBytes(StandardCharsets.UTF_8));
        }

        return readResponse(conn);
    }

    private String readResponse(HttpURLConnection conn) throws IOException {
        InputStream is = conn.getResponseCode() >= 400 ? conn.getErrorStream() : conn.getInputStream();
        if (is == null) {
            throw new IOException("No response stream");
        }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            return sb.toString();
        }
    }

    // ==================== DATA CLASSES ====================

    public static class DeviceCodeResponse {
        public final String deviceCode;
        public final String userCode;
        public final String verificationUri;
        public final int expiresIn;
        public final int interval;

        public DeviceCodeResponse(String deviceCode, String userCode, String verificationUri, int expiresIn, int interval) {
            this.deviceCode = deviceCode;
            this.userCode = userCode;
            this.verificationUri = verificationUri;
            this.expiresIn = expiresIn;
            this.interval = interval;
        }
    }

    public static class MinecraftAccount {
        public String uuid;
        public String username;
        public String accessToken;
        public String refreshToken;
        public long expiresAt;
        public String skinUrl;
    }

    private static class AccountsData {
        List<MinecraftAccount> accounts;
        String selectedUuid;
    }
}

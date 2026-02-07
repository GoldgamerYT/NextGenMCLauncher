package net.gamehost24.launcher.mods;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * CurseForge API Client for mod searching and downloading.
 * Uses CurseForge's public API (requires API key from https://console.curseforge.com)
 */
public class CurseForgeClient {

    private static final String BASE_URL = "https://api.curseforge.com/v1";
    private static final int MINECRAFT_GAME_ID = 432;
    private static final int MODS_CLASS_ID = 6; // Mods category

    // You need to get your own API key from https://console.curseforge.com
    // For now, we use the community proxy which doesn't require a key
    private static final String PROXY_URL = "https://api.cfwidget.com";
    
    private String apiKey;
    private final Gson gson = new Gson();

    public CurseForgeClient() {
        // Try to load API key from environment
        this.apiKey = System.getenv("CURSEFORGE_API_KEY");
    }

    public CurseForgeClient(String apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * Search for mods on CurseForge
     */
    public List<CurseForgeMod> searchMods(String query, String mcVersion, String modLoader, int limit) throws IOException {
        List<CurseForgeMod> mods = new ArrayList<>();

        if (apiKey != null && !apiKey.isEmpty()) {
            // Use official API
            mods = searchWithOfficialApi(query, mcVersion, modLoader, limit);
        } else {
            // Use proxy/widget API (limited functionality)
            mods = searchWithProxyApi(query, limit);
        }

        return mods;
    }

    private List<CurseForgeMod> searchWithOfficialApi(String query, String mcVersion, String modLoader, int limit) throws IOException {
        StringBuilder urlBuilder = new StringBuilder(BASE_URL + "/mods/search?");
        urlBuilder.append("gameId=").append(MINECRAFT_GAME_ID);
        urlBuilder.append("&classId=").append(MODS_CLASS_ID);
        urlBuilder.append("&searchFilter=").append(URLEncoder.encode(query, "UTF-8"));
        urlBuilder.append("&pageSize=").append(limit);
        urlBuilder.append("&sortField=2"); // Sort by popularity
        urlBuilder.append("&sortOrder=desc");

        if (mcVersion != null && !mcVersion.isEmpty()) {
            urlBuilder.append("&gameVersion=").append(URLEncoder.encode(mcVersion, "UTF-8"));
        }

        if (modLoader != null && !modLoader.isEmpty()) {
            int loaderType = getModLoaderType(modLoader);
            if (loaderType > 0) {
                urlBuilder.append("&modLoaderType=").append(loaderType);
            }
        }

        HttpURLConnection conn = (HttpURLConnection) new URL(urlBuilder.toString()).openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("x-api-key", apiKey);
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(10000);

        if (conn.getResponseCode() != 200) {
            throw new IOException("CurseForge API error: " + conn.getResponseCode());
        }

        String response = readResponse(conn);
        return parseModList(response);
    }

    private List<CurseForgeMod> searchWithProxyApi(String query, int limit) throws IOException {
        // The widget API is limited, so we'll return empty for now
        // Users should set their own API key for full functionality
        System.out.println("[CurseForge] No API key configured. Set CURSEFORGE_API_KEY environment variable.");
        return new ArrayList<>();
    }

    private List<CurseForgeMod> parseModList(String json) {
        List<CurseForgeMod> mods = new ArrayList<>();
        JsonObject root = JsonParser.parseString(json).getAsJsonObject();
        JsonArray data = root.getAsJsonArray("data");

        for (JsonElement el : data) {
            JsonObject modJson = el.getAsJsonObject();
            CurseForgeMod mod = new CurseForgeMod();
            
            mod.id = modJson.get("id").getAsInt();
            mod.name = modJson.get("name").getAsString();
            mod.slug = modJson.get("slug").getAsString();
            mod.summary = modJson.has("summary") ? modJson.get("summary").getAsString() : "";
            mod.downloadCount = modJson.has("downloadCount") ? modJson.get("downloadCount").getAsLong() : 0;
            
            if (modJson.has("logo") && !modJson.get("logo").isJsonNull()) {
                mod.iconUrl = modJson.getAsJsonObject("logo").get("url").getAsString();
            }
            
            if (modJson.has("authors") && modJson.getAsJsonArray("authors").size() > 0) {
                mod.author = modJson.getAsJsonArray("authors").get(0).getAsJsonObject().get("name").getAsString();
            }
            
            if (modJson.has("links")) {
                JsonObject links = modJson.getAsJsonObject("links");
                if (links.has("websiteUrl")) {
                    mod.websiteUrl = links.get("websiteUrl").getAsString();
                }
            }
            
            mods.add(mod);
        }

        return mods;
    }

    /**
     * Get mod details including available files/versions
     */
    public CurseForgeMod getModDetails(int modId) throws IOException {
        if (apiKey == null || apiKey.isEmpty()) {
            throw new IOException("CurseForge API key not configured");
        }

        String url = BASE_URL + "/mods/" + modId;
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("x-api-key", apiKey);

        if (conn.getResponseCode() != 200) {
            throw new IOException("Failed to get mod details: " + conn.getResponseCode());
        }

        String response = readResponse(conn);
        JsonObject root = JsonParser.parseString(response).getAsJsonObject();
        JsonObject data = root.getAsJsonObject("data");

        CurseForgeMod mod = new CurseForgeMod();
        mod.id = data.get("id").getAsInt();
        mod.name = data.get("name").getAsString();
        mod.slug = data.get("slug").getAsString();
        mod.summary = data.has("summary") ? data.get("summary").getAsString() : "";
        
        return mod;
    }

    /**
     * Get files for a mod filtered by MC version and loader
     */
    public List<CurseForgeFile> getModFiles(int modId, String mcVersion, String modLoader) throws IOException {
        if (apiKey == null || apiKey.isEmpty()) {
            throw new IOException("CurseForge API key not configured");
        }

        StringBuilder urlBuilder = new StringBuilder(BASE_URL + "/mods/" + modId + "/files?");
        if (mcVersion != null && !mcVersion.isEmpty()) {
            urlBuilder.append("gameVersion=").append(URLEncoder.encode(mcVersion, "UTF-8"));
        }
        if (modLoader != null && !modLoader.isEmpty()) {
            int loaderType = getModLoaderType(modLoader);
            if (loaderType > 0) {
                urlBuilder.append("&modLoaderType=").append(loaderType);
            }
        }

        HttpURLConnection conn = (HttpURLConnection) new URL(urlBuilder.toString()).openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("x-api-key", apiKey);

        if (conn.getResponseCode() != 200) {
            throw new IOException("Failed to get mod files: " + conn.getResponseCode());
        }

        String response = readResponse(conn);
        return parseFileList(response);
    }

    private List<CurseForgeFile> parseFileList(String json) {
        List<CurseForgeFile> files = new ArrayList<>();
        JsonObject root = JsonParser.parseString(json).getAsJsonObject();
        JsonArray data = root.getAsJsonArray("data");

        for (JsonElement el : data) {
            JsonObject fileJson = el.getAsJsonObject();
            CurseForgeFile file = new CurseForgeFile();
            
            file.id = fileJson.get("id").getAsInt();
            file.displayName = fileJson.get("displayName").getAsString();
            file.fileName = fileJson.get("fileName").getAsString();
            file.downloadUrl = fileJson.has("downloadUrl") && !fileJson.get("downloadUrl").isJsonNull() 
                ? fileJson.get("downloadUrl").getAsString() 
                : null;
            file.fileDate = fileJson.get("fileDate").getAsString();
            file.fileLength = fileJson.get("fileLength").getAsLong();
            
            // Get game versions this file supports
            if (fileJson.has("gameVersions")) {
                file.gameVersions = new ArrayList<>();
                for (JsonElement v : fileJson.getAsJsonArray("gameVersions")) {
                    file.gameVersions.add(v.getAsString());
                }
            }
            
            files.add(file);
        }

        return files;
    }

    /**
     * Download a mod file to target directory
     */
    public File downloadFile(CurseForgeFile file, File targetDir) throws IOException {
        if (file.downloadUrl == null) {
            // CurseForge sometimes doesn't provide direct URLs
            // In that case, construct it from the file ID
            file.downloadUrl = constructDownloadUrl(file);
        }

        URL url = new URL(file.downloadUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);

        if (!targetDir.exists()) {
            targetDir.mkdirs();
        }

        File targetFile = new File(targetDir, file.fileName);
        try (InputStream in = conn.getInputStream();
             FileOutputStream out = new FileOutputStream(targetFile)) {
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = in.read(buffer)) != -1) {
                out.write(buffer, 0, bytesRead);
            }
        }

        return targetFile;
    }

    private String constructDownloadUrl(CurseForgeFile file) {
        // CurseForge CDN URL pattern
        int id1 = file.id / 1000;
        int id2 = file.id % 1000;
        return String.format("https://edge.forgecdn.net/files/%d/%d/%s", id1, id2, file.fileName);
    }

    private int getModLoaderType(String loader) {
        if (loader == null) return 0;
        switch (loader.toLowerCase()) {
            case "forge": return 1;
            case "fabric": return 4;
            case "quilt": return 5;
            case "neoforge": return 6;
            default: return 0;
        }
    }

    private String readResponse(HttpURLConnection conn) throws IOException {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            return sb.toString();
        }
    }

    // === Data Classes ===

    public static class CurseForgeMod {
        public int id;
        public String name;
        public String slug;
        public String summary;
        public String author;
        public String iconUrl;
        public String websiteUrl;
        public long downloadCount;
    }

    public static class CurseForgeFile {
        public int id;
        public String displayName;
        public String fileName;
        public String downloadUrl;
        public String fileDate;
        public long fileLength;
        public List<String> gameVersions;
    }
}

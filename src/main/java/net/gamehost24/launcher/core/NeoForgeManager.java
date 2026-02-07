package net.gamehost24.launcher.core;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * NeoForge version management and installation.
 * NeoForge is the successor to Forge for MC 1.20.2+
 */
public class NeoForgeManager {

    private static final String NEOFORGE_MAVEN = "https://maven.neoforged.net/releases/net/neoforged/neoforge/";
    private static final String NEOFORGE_VERSIONS_API = "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge";
    
    // Cache
    private Map<String, List<String>> versionCache = new HashMap<>();
    private long lastFetch = 0;
    private static final long CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    /**
     * Fetch available NeoForge versions for a Minecraft version
     */
    public List<String> fetchVersions(String mcVersion) throws IOException {
        // Check cache
        if (System.currentTimeMillis() - lastFetch < CACHE_DURATION && versionCache.containsKey(mcVersion)) {
            return versionCache.get(mcVersion);
        }

        List<String> allVersions = fetchAllVersions();
        List<String> filtered = filterForMcVersion(allVersions, mcVersion);
        
        versionCache.put(mcVersion, filtered);
        lastFetch = System.currentTimeMillis();
        
        return filtered;
    }

    private List<String> fetchAllVersions() throws IOException {
        URL url = new URL(NEOFORGE_VERSIONS_API);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("Accept", "application/json");
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(10000);

        if (conn.getResponseCode() != 200) {
            throw new IOException("Failed to fetch NeoForge versions: HTTP " + conn.getResponseCode());
        }

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }

            JsonObject json = JsonParser.parseString(sb.toString()).getAsJsonObject();
            JsonArray versions = json.getAsJsonArray("versions");
            
            List<String> result = new ArrayList<>();
            for (JsonElement el : versions) {
                result.add(el.getAsString());
            }
            
            // Sort descending (newest first)
            result.sort(Collections.reverseOrder());
            return result;
        }
    }

    /**
     * Filter NeoForge versions for a specific MC version.
     * NeoForge versions follow pattern: <mcVersion>-<neoforgeVersion>
     * e.g., 20.4.167 for 1.20.4, 21.0.60 for 1.21, etc.
     */
    private List<String> filterForMcVersion(List<String> allVersions, String mcVersion) {
        List<String> filtered = new ArrayList<>();
        
        // Parse MC version (e.g., "1.21.1" -> major=21, minor=1)
        Pattern mcPattern = Pattern.compile("1\\.(\\d+)(?:\\.(\\d+))?");
        Matcher mcMatcher = mcPattern.matcher(mcVersion);
        
        if (!mcMatcher.find()) {
            return filtered;
        }
        
        int mcMajor = Integer.parseInt(mcMatcher.group(1));
        int mcMinor = mcMatcher.group(2) != null ? Integer.parseInt(mcMatcher.group(2)) : 0;
        
        // NeoForge version format: <major>.<minor>.<patch>
        // Major corresponds to MC version (20 = 1.20, 21 = 1.21, etc.)
        // Minor corresponds to MC minor version
        Pattern nfPattern = Pattern.compile("(\\d+)\\.(\\d+)\\.(\\d+)");
        
        for (String version : allVersions) {
            Matcher nfMatcher = nfPattern.matcher(version);
            if (nfMatcher.matches()) {
                int nfMajor = Integer.parseInt(nfMatcher.group(1));
                int nfMinor = Integer.parseInt(nfMatcher.group(2));
                
                // Match: NeoForge major == MC major (20 for 1.20, 21 for 1.21)
                // And NeoForge minor matches MC minor version in some way
                if (nfMajor == mcMajor) {
                    // For MC 1.21.1, look for 21.1.x
                    // For MC 1.20.4, look for 20.4.x
                    if (nfMinor == mcMinor || (mcMinor == 0 && nfMinor == 0)) {
                        filtered.add(version);
                    }
                }
            }
        }
        
        return filtered;
    }

    /**
     * Download and install NeoForge for a profile
     */
    public void install(String neoforgeVersion, File gameDir) throws IOException {
        System.out.println("[NeoForge] Installing version " + neoforgeVersion + " to " + gameDir);
        
        // Download installer
        String installerUrl = NEOFORGE_MAVEN + neoforgeVersion + "/neoforge-" + neoforgeVersion + "-installer.jar";
        File installerJar = new File(gameDir, "neoforge-installer-temp.jar");
        
        System.out.println("[NeoForge] Downloading installer from: " + installerUrl);
        downloadFile(installerUrl, installerJar);
        
        // Run installer in headless mode
        System.out.println("[NeoForge] Running installer...");
        runInstaller(installerJar, gameDir);
        
        // Cleanup
        if (installerJar.exists()) {
            installerJar.delete();
        }
        
        System.out.println("[NeoForge] Installation complete!");
    }

    private void downloadFile(String urlStr, File target) throws IOException {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);

        int status = conn.getResponseCode();
        if (status != 200) {
            throw new IOException("Failed to download: HTTP " + status);
        }

        try (InputStream in = conn.getInputStream()) {
            Files.copy(in, target.toPath(), StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private void runInstaller(File installerJar, File gameDir) throws IOException {
        // NeoForge installer can be run with --installClient <dir>
        ProcessBuilder pb = new ProcessBuilder(
            "java",
            "-jar",
            installerJar.getAbsolutePath(),
            "--installClient",
            gameDir.getAbsolutePath()
        );
        
        pb.directory(gameDir);
        pb.redirectErrorStream(true);
        
        Process process = pb.start();
        
        // Log output
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                System.out.println("[NeoForge Installer] " + line);
            }
        }
        
        try {
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                throw new IOException("NeoForge installer exited with code " + exitCode);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("NeoForge installation interrupted");
        }
    }

    /**
     * Get the version ID for JMCCC after NeoForge installation
     */
    public String getVersionId(String mcVersion, String neoforgeVersion) {
        // NeoForge creates version like: neoforge-<version>
        return "neoforge-" + neoforgeVersion;
    }

    /**
     * Check if NeoForge is already installed
     */
    public boolean isInstalled(String neoforgeVersion, File gameDir) {
        File versionsDir = new File(gameDir, "versions");
        File neoforgeDir = new File(versionsDir, "neoforge-" + neoforgeVersion);
        File jsonFile = new File(neoforgeDir, "neoforge-" + neoforgeVersion + ".json");
        return jsonFile.exists();
    }
}

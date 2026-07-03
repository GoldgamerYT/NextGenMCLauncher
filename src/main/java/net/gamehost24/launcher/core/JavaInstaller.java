package net.gamehost24.launcher.core;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.io.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Downloads and extracts Eclipse Temurin JRE from Adoptium.
 *
 * Install dir layout:
 *   <appDataDir>/java/<feature-version>/   (e.g.  …/java/17/)
 *
 * Usage:
 *   JavaInstaller.install(17, appDataDir, progressCallback)
 */
public class JavaInstaller {

    // Adoptium v3 assets endpoint — returns array of release assets
    // https://api.adoptium.net/q/swagger-ui/#/Assets/searchLatestAssets
    private static final String ADOPTIUM_ASSETS_URL =
        "https://api.adoptium.net/v3/assets/latest/%d/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse";

    private static final Gson       GSON = new Gson();
    private static final HttpClient HTTP = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.ALWAYS)
        .connectTimeout(Duration.ofSeconds(30))
        .build();

    // ─── Public API ───────────────────────────────────────────────────────────

    public interface ProgressCallback {
        /** @param percent 0-100, or -1 for indeterminate */
        void onProgress(int percent, String message);
    }

    /**
     * Download and install Temurin JRE for the given feature version.
     *
     * @param featureVersion  Java major version (17, 21, …)
     * @param appDataDir      Atlas Craft app-data directory
     * @param progress        optional progress callback (may be null)
     * @return absolute path to the java(.exe) executable
     */
    public static String install(int featureVersion, File appDataDir, ProgressCallback progress) throws Exception {

        File javaRoot = new File(appDataDir, "java/" + featureVersion);

        // Check if already installed
        String existing = findJavaExe(javaRoot);
        if (existing != null) {
            report(progress, 100, "Java " + featureVersion + " already installed");
            return existing;
        }

        report(progress, 0, "Resolving Temurin JRE " + featureVersion + "…");

        // 1. Query Adoptium API for the latest release
        String apiUrl = String.format(ADOPTIUM_ASSETS_URL, featureVersion);
        HttpRequest apiReq = HttpRequest.newBuilder()
            .uri(URI.create(apiUrl))
            .header("Accept", "application/json")
            .GET()
            .build();

        HttpResponse<String> apiResp = HTTP.send(apiReq, HttpResponse.BodyHandlers.ofString());
        if (apiResp.statusCode() != 200)
            throw new Exception("Adoptium API error: " + apiResp.statusCode());

        JsonArray assets = GSON.fromJson(apiResp.body(), JsonArray.class);
        if (assets == null || assets.isEmpty())
            throw new Exception("No JRE assets found for Java " + featureVersion);

        JsonObject asset       = assets.get(0).getAsJsonObject();
        JsonObject binary      = asset.getAsJsonObject("binary");
        JsonObject pkg         = binary.getAsJsonObject("package");
        String downloadUrl     = pkg.get("link").getAsString();
        long   expectedBytes   = pkg.has("size") ? pkg.get("size").getAsLong() : -1;
        String fileName        = pkg.get("name").getAsString();

        report(progress, 5, "Downloading " + fileName + " …");

        // 2. Download to a temp file
        javaRoot.mkdirs();
        File tempZip = new File(javaRoot, fileName + ".tmp");

        try {
            downloadWithProgress(downloadUrl, tempZip, expectedBytes, progress);

            // 3. Extract
            report(progress, 80, "Extracting…");
            unzip(tempZip, javaRoot);

        } finally {
            tempZip.delete();
        }

        // 4. Find java.exe inside the extracted folder
        String javaExe = findJavaExe(javaRoot);
        if (javaExe == null)
            throw new Exception("Extraction succeeded but java executable not found in " + javaRoot);

        report(progress, 100, "Java " + featureVersion + " installed at " + javaExe);
        return javaExe;
    }

    /**
     * Returns a map of feature_version → java_exe_path for all versions already
     * installed in <appDataDir>/java/
     */
    public static List<Map<String,Object>> getInstalled(File appDataDir) {
        List<Map<String,Object>> result = new ArrayList<>();
        File javaRoot = new File(appDataDir, "java");
        if (!javaRoot.isDirectory()) return result;

        File[] versionDirs = javaRoot.listFiles(File::isDirectory);
        if (versionDirs == null) return result;

        for (File dir : versionDirs) {
            try {
                int version = Integer.parseInt(dir.getName());
                String exe  = findJavaExe(dir);
                if (exe != null) {
                    Map<String,Object> entry = new LinkedHashMap<>();
                    entry.put("version", version);
                    entry.put("path",    exe);
                    result.add(entry);
                }
            } catch (NumberFormatException ignored) {}
        }
        return result;
    }

    // ─── Internals ────────────────────────────────────────────────────────────

    /** Walk <root> and return the first bin/java.exe found, or null. */
    private static String findJavaExe(File root) {
        if (!root.isDirectory()) return null;
        try {
            return Files.walk(root.toPath())
                .filter(p -> {
                    String name = p.getFileName().toString();
                    return (name.equals("java.exe") || name.equals("java"))
                        && p.getParent() != null
                        && p.getParent().getFileName().toString().equals("bin");
                })
                .findFirst()
                .map(p -> p.toAbsolutePath().toString())
                .orElse(null);
        } catch (IOException e) {
            return null;
        }
    }

    private static void downloadWithProgress(String url, File target, long totalBytes,
                                              ProgressCallback progress) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("User-Agent", "AtlasCraft-Launcher/1.0")
            .GET()
            .build();

        // Stream the response body to disk
        HttpResponse<InputStream> resp = HTTP.send(req, HttpResponse.BodyHandlers.ofInputStream());
        if (resp.statusCode() != 200)
            throw new Exception("Download failed: HTTP " + resp.statusCode());

        try (InputStream in  = new BufferedInputStream(resp.body());
             OutputStream out = new BufferedOutputStream(new FileOutputStream(target))) {

            byte[] buf = new byte[64 * 1024];
            long downloaded = 0;
            int  n;
            int  lastPercent = 5;

            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
                downloaded += n;

                if (totalBytes > 0) {
                    int pct = (int) (5 + 75 * downloaded / totalBytes);   // 5–80 %
                    if (pct > lastPercent) {
                        lastPercent = pct;
                        report(progress, pct,
                            "Downloading… " + (downloaded / 1024 / 1024) + " MB / "
                            + (totalBytes  / 1024 / 1024) + " MB");
                    }
                }
            }
        }
    }

    private static void unzip(File zipFile, File destDir) throws IOException {
        try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(zipFile)))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                File outFile = new File(destDir, entry.getName());

                // Path-traversal guard
                String canonical = outFile.getCanonicalPath();
                if (!canonical.startsWith(destDir.getCanonicalPath() + File.separator)) {
                    zis.closeEntry();
                    continue;
                }

                if (entry.isDirectory()) {
                    outFile.mkdirs();
                } else {
                    outFile.getParentFile().mkdirs();
                    try (OutputStream out = new BufferedOutputStream(new FileOutputStream(outFile))) {
                        byte[] buf = new byte[64 * 1024]; int n;
                        while ((n = zis.read(buf)) != -1) out.write(buf, 0, n);
                    }
                    // Preserve executable bit on Linux/macOS
                    if (outFile.getName().equals("java") || outFile.getName().equals("javaw")) {
                        outFile.setExecutable(true);
                    }
                }
                zis.closeEntry();
            }
        }
    }

    private static void report(ProgressCallback cb, int pct, String msg) {
        if (cb != null) cb.onProgress(pct, msg);
    }
}

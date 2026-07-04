package net.gamehost24.launcher.core;

import com.google.gson.Gson;
import net.gamehost24.launcher.model.Profile;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class JavaManager {
    private static final String APP_DATA_DIR;
    static {
        String os = System.getProperty("os.name").toLowerCase();
        if (os.contains("win")) {
            String appData = System.getenv("APPDATA");
            if (appData == null || appData.isBlank())
                appData = System.getProperty("user.home") + "\\AppData\\Roaming";
            APP_DATA_DIR = appData + "\\AtlasCraft";
        } else {
            APP_DATA_DIR = System.getProperty("user.home") + "/.atlascraft";
        }
    }

    // Shared with JavaInstaller: <AppData>/AtlasCraft/java/<version>/
    private static final File RUNTIMES_DIR = new File(APP_DATA_DIR, "java");

    public JavaManager() {
        if (!RUNTIMES_DIR.exists()) {
            RUNTIMES_DIR.mkdirs();
        }
    }

    public File getJavaPath(int version) throws IOException {
        return getJavaPath(version, null, null);
    }

    public File getJavaPath(int version, LogService log, String profile) throws IOException {
        File javaHome = new File(RUNTIMES_DIR, String.valueOf(version));
        File javaExec = findJavaInHome(javaHome);

        if (javaExec != null) return javaExec;

        // Directory exists but no working java.exe → corrupt, delete it
        if (javaHome.exists()) {
            if (log != null) log.warn("JavaManager", profile,
                "Java " + version + " directory exists but java.exe is missing or broken — deleting and re-downloading…");
            deleteDirectory(javaHome);
        }

        if (log != null) log.info("JavaManager", profile, "Java " + version + " not found — installing…");
        installJava(version, log, profile);

        // After installation, verify again
        javaExec = findJavaInHome(javaHome);
        if (javaExec == null) {
            throw new IOException("Java " + version + " was installed but binary was not found in "
                + javaHome.getAbsolutePath() + ". The archive may have an unexpected structure.");
        }
        return javaExec;
    }

    private File findJavaInHome(File javaHome) {
        String exe = System.getProperty("os.name").toLowerCase().contains("win") ? "java.exe" : "java";

        File direct = new File(new File(javaHome, "bin"), exe);
        if (direct.exists() && isJavaWorking(direct)) return direct;

        if (javaHome.isDirectory()) {
            File[] subdirs = javaHome.listFiles(File::isDirectory);
            if (subdirs != null) {
                for (File sub : subdirs) {
                    File nested = new File(new File(sub, "bin"), exe);
                    if (nested.exists() && isJavaWorking(nested)) return nested;
                }
            }
        }
        return null;
    }

    private boolean isJavaWorking(File javaExe) {
        try {
            Process p = new ProcessBuilder(javaExe.getAbsolutePath(), "-version")
                    .redirectErrorStream(true).start();
            p.getInputStream().transferTo(java.io.OutputStream.nullOutputStream());
            return p.waitFor(5, java.util.concurrent.TimeUnit.SECONDS) && p.exitValue() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    public int getRecommendedJavaVersion(String mcVersion) {
        if (mcVersion == null) return 21;

        // Match the Minecraft 1.X or 1.X.Y version number.
        // Lookbehind (?<![.\d]) prevents matching the "1" inside "0.19.3"
        // where "1" is preceded by "." (part of "0.1" → false positive).
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("(?<![.\\d])1\\.(\\d+)(?:\\.(\\d+))?(?![.\\d])").matcher(mcVersion);
        if (m.find()) {
            try {
                int minor = Integer.parseInt(m.group(1));
                int patch = m.group(2) != null ? Integer.parseInt(m.group(2)) : 0;
                if (minor >= 21) return 21;
                if (minor == 20 && patch >= 5) return 21;
                if (minor >= 17) return 17;
                return 8;
            } catch (NumberFormatException ignored) {}
        }

        // No standard 1.X version found (e.g. "fabric-loader-0.19.3-26.2") → Java 21
        return 21;
    }

    private void installJava(int version) throws IOException {
        installJava(version, null, null);
    }

    private void installJava(int version, LogService log, String profileName) throws IOException {
        String os = getOS();
        String arch = getArch();

        String urlStr = String.format(
            "https://api.adoptium.net/v3/binary/latest/%d/ga/%s/%s/jre/hotspot/normal/eclipse",
            version, os, arch
        );

        log("Downloading Java " + version + " from Adoptium…", log, profileName);

        File zipFile = new File(RUNTIMES_DIR, "java-" + version + ".zip.tmp");
        File finalZip = new File(RUNTIMES_DIR, "java-" + version + ".zip");
        File extractDir = new File(RUNTIMES_DIR, String.valueOf(version));

        // Clean up any previous partial extraction
        if (extractDir.exists()) deleteDirectory(extractDir);

        try {
            downloadFile(urlStr, zipFile, log, profileName);

            // Validate: must start with PK (ZIP magic bytes 0x50 0x4B)
            try (FileInputStream fis = new FileInputStream(zipFile)) {
                byte[] magic = new byte[4];
                if (fis.read(magic) < 4 || magic[0] != 0x50 || magic[1] != 0x4B) {
                    throw new IOException("Downloaded file is not a valid ZIP (bad magic bytes)");
                }
            }

            // Rename to final name only after validation
            zipFile.renameTo(finalZip);

            log("Extracting Java " + version + "…", log, profileName);
            unzip(finalZip, extractDir);
            finalZip.delete();
            log("Java " + version + " installed successfully.", log, profileName);
        } catch (IOException e) {
            // Clean up partial files
            zipFile.delete();
            finalZip.delete();
            if (extractDir.exists()) deleteDirectory(extractDir);
            throw new IOException("Java " + version + " install failed: " + e.getMessage(), e);
        }
    }

    public void preInstallAllVersionsAsync() {
        int[] versions = {8, 17, 21};
        for (int ver : versions) {
            final int v = ver;
            Thread t = new Thread(() -> {
                try {
                    File javaHome = new File(RUNTIMES_DIR, String.valueOf(v));
                    File javaExec = findJavaInHome(javaHome);
                    if (javaExec != null) return; // Already installed and working
                    LogService log = LogService.getInstance();
                    if (log != null) log.info("JavaManager", null, "Pre-installing Java " + v + " in background…");
                    installJava(v, log, null);
                } catch (Exception e) {
                    LogService log = LogService.getInstance();
                    if (log != null) log.warn("JavaManager", null, "Background Java " + v + " install failed: " + e.getMessage());
                }
            }, "java-preinstall-" + v);
            t.setDaemon(true);
            t.start();
        }
    }

    private void log(String msg, LogService log, String profile) {
        System.out.println(msg);
        if (log != null) log.info("JavaManager", profile, msg);
    }

    private static void deleteDirectory(File dir) {
        File[] files = dir.listFiles();
        if (files != null) for (File f : files) {
            if (f.isDirectory()) deleteDirectory(f);
            else f.delete();
        }
        dir.delete();
    }

    private String getOS() {
        String os = System.getProperty("os.name").toLowerCase();
        if (os.contains("win")) return "windows";
        if (os.contains("mac")) return "mac";
        if (os.contains("nix") || os.contains("nux") || os.contains("aix")) return "linux";
        return "windows";
    }

    private String getArch() {
        String arch = System.getProperty("os.arch").toLowerCase();
        if (arch.contains("64")) return "x64";
        if (arch.contains("86") || arch.contains("32")) return "x86";
        if (arch.contains("arm") || arch.contains("aarch")) return "aarch64"; // simplified
        return "x64"; 
    }

    private void downloadFile(String urlStr, File target, LogService log, String profile) throws IOException {
        // Follow up to 5 redirects manually so we never lose the User-Agent across hops
        for (int redirects = 0; redirects < 5; redirects++) {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false); // we handle manually
            conn.setRequestProperty("User-Agent",
                "Mozilla/5.0 AtlasCraftLauncher/1.0 (https://atlascraft.example)");
            conn.setConnectTimeout(30_000);
            conn.setReadTimeout(120_000);

            int status = conn.getResponseCode();
            if (status == HttpURLConnection.HTTP_OK) {
                long contentLength = conn.getContentLengthLong();
                try (InputStream in = conn.getInputStream();
                     FileOutputStream out = new FileOutputStream(target)) {
                    byte[] buffer = new byte[65536];
                    long downloaded = 0;
                    long lastLog = 0;
                    int bytesRead;
                    while ((bytesRead = in.read(buffer)) != -1) {
                        out.write(buffer, 0, bytesRead);
                        downloaded += bytesRead;
                        if (log != null && contentLength > 0 && downloaded - lastLog > 10 * 1024 * 1024) {
                            int pct = (int) (downloaded * 100 / contentLength);
                            log.info("JavaManager", profile, "Downloading… " + pct + "% ("
                                + (downloaded / 1024 / 1024) + "MB / " + (contentLength / 1024 / 1024) + "MB)");
                            lastLog = downloaded;
                        }
                    }
                }
                return;
            }
            if (status == HttpURLConnection.HTTP_MOVED_TEMP
                    || status == HttpURLConnection.HTTP_MOVED_PERM
                    || status == 307 || status == 308
                    || status == HttpURLConnection.HTTP_SEE_OTHER) {
                String location = conn.getHeaderField("Location");
                if (location == null) throw new IOException("Redirect with no Location header");
                urlStr = location;
                conn.disconnect();
                continue;
            }
            throw new IOException("Server returned HTTP " + status + " for " + urlStr);
        }
        throw new IOException("Too many redirects downloading Java");
    }

    private void unzip(File zipFile, File targetDir) throws IOException {
        if (!targetDir.exists()) targetDir.mkdirs();
        try (ZipInputStream zis = new ZipInputStream(new FileInputStream(zipFile))) {
            ZipEntry zipEntry = zis.getNextEntry();
            while (zipEntry != null) {
                File newFile = new File(targetDir, zipEntry.getName());
                // Security Check
                if (!newFile.getCanonicalPath().startsWith(targetDir.getCanonicalPath())) {
                    throw new IOException("Zip entry is outside of the target dir: " + zipEntry.getName());
                }

                if (zipEntry.isDirectory()) {
                    newFile.mkdirs();
                } else {
                    new File(newFile.getParent()).mkdirs();
                    try (FileOutputStream fos = new FileOutputStream(newFile)) {
                         byte[] buffer = new byte[1024];
                         int len;
                         while ((len = zis.read(buffer)) > 0) {
                             fos.write(buffer, 0, len);
                         }
                    }
                    // Simple permission fix for unix
                    if (!System.getProperty("os.name").toLowerCase().contains("win")) {
                        newFile.setExecutable(true);
                    }
                }
                zipEntry = zis.getNextEntry();
            }
        }
    }
}

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
            APP_DATA_DIR = System.getenv("APPDATA") + "\\AtlasCraft";
        } else {
            APP_DATA_DIR = System.getProperty("user.home") + "/.atlascraft";
        }
    }

    private static final File RUNTIMES_DIR = new File(APP_DATA_DIR, "runtimes");

    public JavaManager() {
        if (!RUNTIMES_DIR.exists()) {
            RUNTIMES_DIR.mkdirs();
        }
    }

    public File getJavaPath(int version) throws IOException {
        File javaHome = new File(RUNTIMES_DIR, "java-" + version);
        File bin = new File(javaHome, "bin");
        File javaExec = new File(bin, System.getProperty("os.name").toLowerCase().contains("win") ? "java.exe" : "java");
        
        // Allow nested folder structure from some zips (e.g. jdk-17.0.1/bin/java)
        if (!javaExec.exists() && javaHome.exists()) {
             File[] files = javaHome.listFiles(File::isDirectory);
             if (files != null && files.length == 1) {
                 bin = new File(files[0], "bin");
                 javaExec = new File(bin, System.getProperty("os.name").toLowerCase().contains("win") ? "java.exe" : "java");
             }
        }

        if (javaExec.exists()) {
            return javaExec;
        }

        System.out.println("Java " + version + " not found. Installing...");
        installJava(version);
        
        // Recursively check again
        return getJavaPath(version);
    }

    public int getRecommendedJavaVersion(String mcVersion) {
        if (mcVersion == null) return 8;
        
        // Find pattern 1.x or 1.x.x
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("1\\.(\\d+)(?:\\.(\\d+))?").matcher(mcVersion);
        if (m.find()) {
            try {
                int minor = Integer.parseInt(m.group(1));
                int patch = m.group(2) != null ? Integer.parseInt(m.group(2)) : 0;

                if (minor >= 21) return 21; // 1.21+ needs Java 21
                if (minor == 20) {
                    if (patch >= 5) return 21; // 1.20.5+ needs Java 21
                    return 17; // 1.20.4 and below uses Java 17
                }
                if (minor >= 18) return 17; // 1.18+ needs Java 17
                if (minor >= 17) return 17; // 1.17 usually works with 17 (officially 16)
                
                return 8; // 1.16 and below
            } catch (NumberFormatException e) {
                // ignore
            }
        }
        return 8;
    }

    private void installJava(int version) throws IOException {
        String os = getOS();
        String arch = getArch();
        
        // Adoptium API
        String urlStr = String.format(
            "https://api.adoptium.net/v3/binary/latest/%d/ga/%s/%s/jdk/hotspot/normal/eclipse",
            version, os, arch
        );

        System.out.println("Downloading Java " + version + " from " + urlStr);
        
        File zipFile = new File(RUNTIMES_DIR, "java-" + version + ".zip");
        File extractDir = new File(RUNTIMES_DIR, "java-" + version);

        downloadFile(urlStr, zipFile);
        
        System.out.println("Extracting Java " + version + "...");
        unzip(zipFile, extractDir);
        
        zipFile.delete();
        System.out.println("Java " + version + " installed successfully.");
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

    private void downloadFile(String urlStr, File target) throws IOException {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setInstanceFollowRedirects(true);
        
        // Handle redirects manually if needed, but setInstanceFollowRedirects(true) usually works for 302
        int status = conn.getResponseCode();
        if (status != HttpURLConnection.HTTP_OK) {
             if (status == HttpURLConnection.HTTP_MOVED_TEMP || status == HttpURLConnection.HTTP_MOVED_PERM || status == HttpURLConnection.HTTP_SEE_OTHER) {
                downloadFile(conn.getHeaderField("Location"), target);
                return;
             }
             throw new IOException("Server returned HTTP " + status);
        }

        try (InputStream in = conn.getInputStream();
             FileOutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = in.read(buffer)) != -1) {
                out.write(buffer, 0, bytesRead);
            }
        }
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

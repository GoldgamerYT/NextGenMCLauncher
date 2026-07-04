package net.gamehost24.launcher.core;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import net.gamehost24.launcher.model.Profile;

import java.io.*;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;

public class ProfileManager {
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
        new File(APP_DATA_DIR).mkdirs();
    }

    private static final File PROFILES_FILE = new File(APP_DATA_DIR, "profiles.json");
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private List<Profile> profiles;

    public ProfileManager() {
        this.profiles = new ArrayList<>();
        loadProfiles();
    }

    public void loadProfiles() {
        if (!PROFILES_FILE.exists()) {
            return;
        }
        try (Reader reader = new FileReader(PROFILES_FILE)) {
            Type listType = new TypeToken<ArrayList<Profile>>() {
            }.getType();
            List<Profile> loaded = GSON.fromJson(reader, listType);
            if (loaded != null) {
                profiles = loaded;
            }
        } catch (Exception e) {
            System.err.println("Failed to load profiles: " + e.getMessage());
            profiles = new ArrayList<>();
        }
    }

    public void saveProfiles() {
        try (Writer writer = new FileWriter(PROFILES_FILE)) {
            GSON.toJson(profiles, writer);
            System.out.println("[ProfileManager] Saved " + profiles.size() + " profiles to " + PROFILES_FILE.getAbsolutePath());
        } catch (IOException e) {
            System.err.println("[ProfileManager] FAILED to save profiles: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("Failed to save profiles: " + e.getMessage(), e);
        }
    }

    public void addProfile(Profile profile) {
        // Enforce centralized storage: %APPDATA%\AtlasCraft\instances\<ProfileName>
        // We force this path to ensure "centralized storage" requirement is met.
        File instanceDir = new File(APP_DATA_DIR, "instances/" + profile.getName());
        profile.setGameDir(instanceDir.getAbsolutePath());

        if (!instanceDir.exists()) {
            instanceDir.mkdirs();
        }

        profiles.add(profile);
        saveProfiles();
    }

    public void removeProfile(Profile profile) {
        profiles.remove(profile);
        saveProfiles();

        File gameDir = new File(profile.getGameDir());
        if (gameDir.exists() && gameDir.isDirectory()) {
            deleteDirectory(gameDir);
        }
    }

    public String backupProfile(String profileName) throws IOException {
        Profile p = getProfile(profileName);
        if (p == null) throw new IllegalArgumentException("Profile not found: " + profileName);

        File backupDir = new File(APP_DATA_DIR, "backups");
        if (!backupDir.exists()) backupDir.mkdirs();

        String timestamp = new java.text.SimpleDateFormat("yyyy-MM-dd_HH-mm-ss").format(new java.util.Date());
        File backupFile = new File(backupDir, profileName + "-" + timestamp + ".zip");

        File sourceDir = new File(p.getGameDir());
        if (!sourceDir.exists()) throw new IOException("Instance directory does not exist.");

        zipDirectory(sourceDir, backupFile);
        return backupFile.getAbsolutePath();
    }

    public void restoreProfile(String profileName, File backupFile) throws IOException {
       // Restore logic: 
       // 1. Delete current instance dir (if clean restore desired) or overwrite.
       // 2. Unzip backupFile to instance dir.
       Profile p = getProfile(profileName);
       if (p == null) throw new IllegalArgumentException("Profile not found");
       
       File targetDir = new File(p.getGameDir());
       // For "intelligent" restore, maybe backup current state first?
       // For now, simpler exact restore:
       unzipDirectory(backupFile, targetDir);
    }

    private void zipDirectory(File sourceDir, File zipFile) throws IOException {
        try (java.util.zip.ZipOutputStream zos = new java.util.zip.ZipOutputStream(new FileOutputStream(zipFile))) {
             java.nio.file.Path sourcePath = sourceDir.toPath();
             java.nio.file.Files.walk(sourcePath)
                .filter(path -> !java.nio.file.Files.isDirectory(path))
                .forEach(path -> {
                    try {
                        String zipEntryName = sourcePath.relativize(path).toString().replace('\\', '/');
                        zos.putNextEntry(new java.util.zip.ZipEntry(zipEntryName));
                        java.nio.file.Files.copy(path, zos);
                        zos.closeEntry();
                    } catch (IOException e) {
                        System.err.println("Error zipping " + path + ": " + e.getMessage());
                    }
                });
        }
    }

    private void unzipDirectory(File zipFile, File targetDir) throws IOException {
        if (!targetDir.exists()) targetDir.mkdirs();
        try (java.util.zip.ZipInputStream zis = new java.util.zip.ZipInputStream(new FileInputStream(zipFile))) {
            java.util.zip.ZipEntry zipEntry = zis.getNextEntry();
            while (zipEntry != null) {
                File newFile = new File(targetDir, zipEntry.getName());
                // Security check for Zip Slip
                String destDirPath = targetDir.getCanonicalPath();
                String destFilePath = newFile.getCanonicalPath();
                if (!destFilePath.startsWith(destDirPath + File.separator)) {
                    throw new IOException("Entry is outside of the target dir: " + zipEntry.getName());
                }

                if (zipEntry.isDirectory()) {
                    if (!newFile.isDirectory() && !newFile.mkdirs()) {
                        throw new IOException("Failed to create directory " + newFile);
                    }
                } else {
                    // fix for Windows-created archives
                    File parent = newFile.getParentFile();
                    if (!parent.isDirectory() && !parent.mkdirs()) {
                        throw new IOException("Failed to create directory " + parent);
                    }
                    try (FileOutputStream fos = new FileOutputStream(newFile)) {
                         byte[] buffer = new byte[1024];
                         int len;
                         while ((len = zis.read(buffer)) > 0) {
                             fos.write(buffer, 0, len);
                         }
                    }
                }
                zipEntry = zis.getNextEntry();
            }
            zis.closeEntry();
        }
    }

    private void deleteDirectory(File dir) {
        File[] files = dir.listFiles();
        if (files != null) {
            for (File file : files) {
                if (file.isDirectory()) {
                    deleteDirectory(file);
                } else {
                    file.delete();
                }
            }
        }
        dir.delete();
    }

    public List<Profile> getProfiles() {
        return profiles;
    }

    public Profile getProfile(String name) {
        return profiles.stream()
                .filter(p -> p.getName().equals(name))
                .findFirst()
                .orElse(null);
    }
}

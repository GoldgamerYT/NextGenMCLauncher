package net.gamehost24.launcher.core.forge;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.to2mbn.jmccc.mcdownloader.download.tasks.ResultProcessor;
import org.to2mbn.jmccc.option.MinecraftDirectory;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class CustomInstallProfileProcessor implements ResultProcessor<byte[], String> {

    private final MinecraftDirectory mcdir;

    public CustomInstallProfileProcessor(MinecraftDirectory mcdir) {
        this.mcdir = mcdir;
    }

    @Override
    public String process(byte[] arg) throws Exception {
        // Save installer to disk
        // We need to save it to run it.
        File installerFile = new File(mcdir.getAbsolutePath(), "forge-installer-temp.jar");
        try (OutputStream out = new FileOutputStream(installerFile)) {
            out.write(arg);
        }

        String versionId = null;

        // Extract version ID from install_profile.json inside the jar
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(arg))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if ("install_profile.json".equals(entry.getName())) {
                    // Read JSON
                    // Since we can't easily read byte array from zis without closing entry,
                    // we read it into a String.
                    // Assumes JSON is small.
                    StringBuilder jsonStr = new StringBuilder();
                    byte[] buffer = new byte[1024];
                    int len;
                    while ((len = zis.read(buffer)) > 0) {
                        jsonStr.append(new String(buffer, 0, len, "UTF-8"));
                    }

                    try {
                        JsonObject json = JsonParser.parseString(jsonStr.toString()).getAsJsonObject();
                        // For 1.13+ format: .versionInfo.id or .version
                        // Check logic
                        if (json.has("version")) {
                            versionId = json.get("version").getAsString();
                        } else if (json.has("versionInfo")) {
                            // older/other format
                            JsonObject vInfo = json.getAsJsonObject("versionInfo");
                            if (vInfo.has("id")) {
                                versionId = vInfo.get("id").getAsString();
                            }
                        }
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                    break;
                }
            }
        }

        // If we couldn't find versionId, we might fail downstream, but let's try to
        // proceed.
        // Or we can try to guess or let the installer run.
        // But the return value is the version ID used for launch.

        // Create default launcher_profiles.json if not exists
        // The installer often requires this file to exist to locate the profile
        File profilesJson = new File(mcdir.getAbsolutePath(), "launcher_profiles.json");
        if (!profilesJson.exists()) {
            try {
                Files.write(profilesJson.toPath(), "{}".getBytes("UTF-8"));
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        System.out.println("Installing Forge using custom processor...");
        System.out.println("Installer: " + installerFile.getAbsolutePath());
        System.out.println("Target: " + mcdir.getAbsolutePath());

        // Run Installer
        // java -jar installer.jar --installClient <mcdir>
        ProcessBuilder pb = new ProcessBuilder(
                System.getProperty("java.home") + "/bin/java",
                "-jar",
                installerFile.getAbsolutePath(),
                "--installClient",
                mcdir.getAbsolutePath());
        pb.redirectErrorStream(true);
        Process p = pb.start();

        // Capture output
        StringBuilder output = new StringBuilder();
        try (java.io.BufferedReader reader = new java.io.BufferedReader(
                new java.io.InputStreamReader(p.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                System.out.println("[ForgeInstaller] " + line);
                output.append(line).append("\n");
            }
        }

        int exitCode = p.waitFor();

        // Clean up
        installerFile.delete();

        if (exitCode != 0) {
            throw new Exception("Forge installer failed with exit code: " + exitCode + "\nLog:\n" + output.toString());
        }

        return versionId;
    }
}

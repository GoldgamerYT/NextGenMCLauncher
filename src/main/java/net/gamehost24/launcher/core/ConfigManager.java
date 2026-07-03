package net.gamehost24.launcher.core;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.gamehost24.launcher.model.LauncherConfig;

import java.io.*;

public class ConfigManager {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private final File configFile;
    private LauncherConfig config;

    public ConfigManager(File appDataDir) {
        appDataDir.mkdirs();
        this.configFile = new File(appDataDir, "config.json");
        loadConfig();
    }

    public void loadConfig() {
        if (!configFile.exists()) {
            config = new LauncherConfig();
            saveConfig();
            return;
        }
        try (Reader reader = new FileReader(configFile)) {
            config = GSON.fromJson(reader, LauncherConfig.class);
            if (config == null) {
                config = new LauncherConfig();
            }
        } catch (Exception e) {
            System.err.println("Failed to load config: " + e.getMessage());
            config = new LauncherConfig();
        }
    }

    public void saveConfig() {
        try (Writer writer = new FileWriter(configFile)) {
            GSON.toJson(config, writer);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public LauncherConfig getConfig() {
        return config;
    }

    public void updateConfig(LauncherConfig newConfig) {
        this.config = newConfig;
        saveConfig();
    }
}

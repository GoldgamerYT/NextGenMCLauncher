package net.gamehost24.launcher.model;

import java.io.File;

public class Profile {
    private String name;
    private String version; // e.g., "1.20.1"
    private String modLoader; // "vanilla", "fabric", "forge"
    private String loaderVersion; // e.g., "0.15.7" (Fabric) or "47.1.0" (Forge), "neoforge"
    private int ramMb;
    private String javaPath;
    private String gameDir;
    private String iconPath; // Path to icon image or predefined name

    public Profile(String name, String version, String modLoader, int ramMb, String javaPath, String gameDir,
            String iconPath) {
        this.name = name;
        this.version = version;
        this.modLoader = modLoader;
        this.ramMb = ramMb;
        this.javaPath = javaPath;
        this.gameDir = gameDir;
        this.iconPath = iconPath;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public String getModLoader() {
        return modLoader;
    }

    public void setModLoader(String modLoader) {
        this.modLoader = modLoader;
    }

    public String getLoaderVersion() {
        return loaderVersion;
    }

    public void setLoaderVersion(String loaderVersion) {
        this.loaderVersion = loaderVersion;
    }

    public int getRamMb() {
        return ramMb;
    }

    public void setRamMb(int ramMb) {
        this.ramMb = ramMb;
    }

    public String getJavaPath() {
        return javaPath;
    }

    public void setJavaPath(String javaPath) {
        this.javaPath = javaPath;
    }

    public String getGameDir() {
        return gameDir;
    }

    public void setGameDir(String gameDir) {
        this.gameDir = gameDir;
    }

    public String getIconPath() {
        return iconPath;
    }

    public void setIconPath(String iconPath) {
        this.iconPath = iconPath;
    }

    public String getIcon() {
        return iconPath;
    }

    public void setIcon(String icon) {
        this.iconPath = icon;
    }

    @Override
    public String toString() {
        return name + " (" + version + " - " + modLoader + ")";
    }
}

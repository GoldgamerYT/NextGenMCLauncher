package net.gamehost24.launcher.model;

import java.io.File;

public class Profile {
    private String name;
    private String version; // e.g., "1.20.1"
    private String modLoader; // "vanilla", "fabric", "forge"
    private String loaderVersion; // e.g., "0.15.7" (Fabric) or "47.1.0" (Forge), "neoforge"
    private int ramMb; // profile-specific max RAM (only used when useGlobalRam=false)
    private String javaPath;
    private String gameDir;
    private String iconPath;  // Path to icon image or predefined name
    private String cardColor; // Card gradient preset key (e.g. "blue", "red", null = loader default)

    // ── RAM override ──────────────────────────────────────────────────────────
    /** When true (default) the launcher uses the global RAM defaults from LauncherConfig. */
    private boolean useGlobalRam = true;
    /** Profile-specific minimum RAM in MB. Only used when useGlobalRam=false. 0 = inherit global min. */
    private int profileMinRamMb = 0;

    /**
     * No-arg constructor required for correct Gson deserialization.
     *
     * Gson uses sun.misc.Unsafe.allocateInstance() when no no-arg constructor
     * exists, which bypasses ALL constructors AND field initializers. The JVM
     * zero-value for boolean is false, so 'useGlobalRam' would silently become
     * false for every profile loaded from JSON (even if the field is absent).
     * With a no-arg constructor, Gson uses normal reflection and field
     * initializers run — giving useGlobalRam its intended default of true.
     */
    public Profile() {
        this.useGlobalRam   = true;
        this.profileMinRamMb = 0;
    }

    public Profile(String name, String version, String modLoader, int ramMb, String javaPath, String gameDir,
            String iconPath) {
        this.name          = name;
        this.version       = version;
        this.modLoader     = modLoader;
        this.ramMb         = ramMb;
        this.javaPath      = javaPath;
        this.gameDir       = gameDir;
        this.iconPath      = iconPath;
        this.useGlobalRam  = true;
        this.profileMinRamMb = 0;
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

    public String getCardColor() {
        return cardColor;
    }

    public void setCardColor(String cardColor) {
        this.cardColor = cardColor;
    }

    public boolean isUseGlobalRam() {
        return useGlobalRam;
    }

    public void setUseGlobalRam(boolean useGlobalRam) {
        this.useGlobalRam = useGlobalRam;
    }

    public int getProfileMinRamMb() {
        return profileMinRamMb;
    }

    public void setProfileMinRamMb(int profileMinRamMb) {
        this.profileMinRamMb = profileMinRamMb;
    }

    @Override
    public String toString() {
        return name + " (" + version + " - " + modLoader + ")";
    }
}

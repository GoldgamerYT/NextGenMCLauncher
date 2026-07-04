package net.gamehost24.launcher.model;

/**
 * Persistent launcher configuration.
 * Stored in config.json next to the JAR / in the working directory.
 *
 * Fields are public for clean Gson serialization and simple access.
 * Defaults are set here and applied if the field is missing from the saved JSON.
 */
public class LauncherConfig {

    // ── Memory ────────────────────────────────────────────────────────────────
    private int defaultRamMb = 4096;
    private int minRamMb     = 512;

    // ── Java ──────────────────────────────────────────────────────────────────
    private String defaultJavaPath = "";
    private String jvmArgs         = "";

    // ── Paths ─────────────────────────────────────────────────────────────────
    private String defaultGameDir = "";

    // ── UI ────────────────────────────────────────────────────────────────────
    private double gridScale = 1.0;

    // ── Minecraft window ──────────────────────────────────────────────────────
    private int     windowWidth  = 854;
    private int     windowHeight = 480;
    private boolean fullscreen   = false;

    // ── Behaviour ─────────────────────────────────────────────────────────────
    private boolean autoStartLast = false;

    // ── Microsoft Auth ────────────────────────────────────────────────────────
    /**
     * Azure AD Application (client) ID for Microsoft/Xbox login.
     *
     * Register a free app at https://portal.azure.com:
     *   App registrations → New registration
     *   Supported account types: Personal Microsoft accounts only
     *   Authentication → Allow public client flows: Yes
     *   No client secret needed (public client).
     *
     * The client ID is NOT a secret — it is safe to store in config.json.
     */
    private String microsoftClientId = "";

    // ── CurseForge API ────────────────────────────────────────────────────────
    private String curseForgeApiKey = "";

    // ── Getters / Setters ─────────────────────────────────────────────────────

    public int getDefaultRamMb()               { return defaultRamMb > 0 ? defaultRamMb : 4096; }
    public void setDefaultRamMb(int v)         { this.defaultRamMb = Math.max(256, v); }

    public int getMinRamMb()                   { return minRamMb > 0 ? minRamMb : 512; }
    public void setMinRamMb(int v)             { this.minRamMb = Math.max(128, v); }

    public String getDefaultJavaPath()         { return defaultJavaPath != null ? defaultJavaPath : ""; }
    public void setDefaultJavaPath(String v)   { this.defaultJavaPath = v; }

    public String getJvmArgs()                 { return jvmArgs != null ? jvmArgs : ""; }
    public void setJvmArgs(String v)           { this.jvmArgs = v; }

    public String getDefaultGameDir()          { return defaultGameDir != null ? defaultGameDir : ""; }
    public void setDefaultGameDir(String v)    { this.defaultGameDir = v; }

    public double getGridScale()               { return gridScale > 0 ? gridScale : 1.0; }
    public void setGridScale(double v)         { this.gridScale = v; }

    public int getWindowWidth()                { return windowWidth > 0 ? windowWidth : 854; }
    public void setWindowWidth(int v)          { this.windowWidth = v; }

    public int getWindowHeight()               { return windowHeight > 0 ? windowHeight : 480; }
    public void setWindowHeight(int v)         { this.windowHeight = v; }

    public boolean isFullscreen()              { return fullscreen; }
    public void setFullscreen(boolean v)       { this.fullscreen = v; }

    public boolean isAutoStartLast()           { return autoStartLast; }
    public void setAutoStartLast(boolean v)    { this.autoStartLast = v; }

    public String getMicrosoftClientId()       { return microsoftClientId != null ? microsoftClientId.trim() : ""; }
    public void setMicrosoftClientId(String v) { this.microsoftClientId = v != null ? v.trim() : ""; }

    public String getCurseForgeApiKey()        { return curseForgeApiKey != null ? curseForgeApiKey.trim() : ""; }
    public void setCurseForgeApiKey(String v)  { this.curseForgeApiKey = v != null ? v.trim() : ""; }
}

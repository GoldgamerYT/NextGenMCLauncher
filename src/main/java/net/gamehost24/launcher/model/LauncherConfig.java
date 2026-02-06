package net.gamehost24.launcher.model;

public class LauncherConfig {
    private int defaultRamMb = 4096;
    private String defaultJavaPath = "";
    private double gridScale = 1.0;

    public int getDefaultRamMb() {
        return defaultRamMb;
    }

    public void setDefaultRamMb(int defaultRamMb) {
        this.defaultRamMb = defaultRamMb;
    }

    public String getDefaultJavaPath() {
        return defaultJavaPath;
    }

    public void setDefaultJavaPath(String defaultJavaPath) {
        this.defaultJavaPath = defaultJavaPath;
    }

    public double getGridScale() {
        return gridScale;
    }

    public void setGridScale(double gridScale) {
        this.gridScale = gridScale;
    }
}

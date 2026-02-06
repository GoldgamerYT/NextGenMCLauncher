package net.gamehost24.launcher.ui.fx;

import com.google.gson.Gson;
import javafx.application.Platform;
import javafx.stage.Stage;
import net.gamehost24.launcher.core.LauncherEngine;
import net.gamehost24.launcher.core.ProfileManager;
import net.gamehost24.launcher.core.VersionManager;
import net.gamehost24.launcher.model.Profile;
import org.to2mbn.jmccc.mcdownloader.download.concurrent.DownloadCallback;

import java.awt.Desktop;
import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.Executors;

public class JSBridge {

    private final ProfileManager profileManager;
    private final VersionManager versionManager;
    private final LauncherEngine launcherEngine;
    private final Gson gson;
    private final LauncherFX app;

    public JSBridge(LauncherFX app) {
        this.app = app;
        this.profileManager = new ProfileManager();
        this.versionManager = new VersionManager();
        this.launcherEngine = new LauncherEngine();
        this.gson = new Gson();
    }

    // --- Window Controls ---

    public void windowClose() {
        Platform.runLater(() -> System.exit(0));
    }

    public void windowMin() {
        Platform.runLater(() -> {
            if (app.webView != null && app.webView.getScene() != null) {
                Stage stage = (Stage) app.webView.getScene().getWindow();
                stage.setIconified(true);
            }
        });
    }

    public void windowMax() {
        Platform.runLater(() -> {
            if (app.webView != null && app.webView.getScene() != null) {
                Stage stage = (Stage) app.webView.getScene().getWindow();
                stage.setMaximized(!stage.isMaximized());
            }
        });
    }

    // --- Profile Management ---

    public String getProfiles() {
        return gson.toJson(profileManager.getProfiles());
    }

    public void createProfile(String json) {
        try {
            Profile p = gson.fromJson(json, Profile.class);
            if (p.getIcon() == null || p.getIcon().isEmpty()) {
                p.setIcon("Box");
            }
            profileManager.addProfile(p);
            installProfile(p.getName());
        } catch (Exception e) {
            e.printStackTrace();
            sendNotification("Error creating profile: " + e.getMessage(), "error");
        }
    }

    public void deleteProfile(String name) {
        Profile p = profileManager.getProfile(name);
        if (p != null) {
            profileManager.removeProfile(p);
            sendNotification("Profile deleted: " + name, "success");
        }
    }

    public void saveProfileSettings(String name, int ram) {
        Profile p = profileManager.getProfile(name);
        if (p != null) {
            p.setRamMb(ram);
            profileManager.saveProfiles();
            sendNotification("Settings saved.", "success");
        }
    }

    // --- System / Utils ---

    public long getSystemMemory() {
        try {
            return ((com.sun.management.OperatingSystemMXBean) java.lang.management.ManagementFactory
                    .getOperatingSystemMXBean()).getTotalMemorySize();
        } catch (Exception e) {
            return 16L * 1024 * 1024 * 1024;
        }
    }

    public void openModsFolder(String profileName) {
        Profile p = profileManager.getProfile(profileName);
        if (p == null)
            return;

        File modsDir = new File(new File(p.getGameDir()), "mods");
        if (!modsDir.exists())
            modsDir.mkdirs();

        try {
            if (Desktop.isDesktopSupported()) {
                Desktop.getDesktop().open(modsDir);
            } else {
                Runtime.getRuntime().exec("explorer.exe " + modsDir.getAbsolutePath());
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    // --- Version Fetching ---

    public void fetchGameVersions() {
        System.out.println("Fetching game versions...");
        versionManager.fetchGameVersions(new DownloadCallback<List<String>>() {
            @Override
            public void done(List<String> result) {
                System.out.println("Got " + result.size() + " game versions.");
                String json = gson.toJson(result);
                runJS("receiveGameVersions", json);
            }

            @Override
            public void failed(Throwable e) {
                e.printStackTrace();
                runJS("receiveGameVersions", "[]");
            }

            @Override
            public void cancelled() {
            }

            @Override
            public void updateProgress(long done, long total) {
            }

            @Override
            public void retry(Throwable e, int current, int max) {
            }
        });
    }

    public void fetchFabricVersions(String mcVer) {
        System.out.println("Fetching Fabric for " + mcVer);
        versionManager.fetchFabricLoaderVersions(mcVer, new DownloadCallback<List<String>>() {
            @Override
            public void done(List<String> result) {
                System.out.println("Got " + result.size() + " Fabric versions.");
                String json = gson.toJson(result);
                runJS("receiveFabricVersions", json);
            }

            @Override
            public void failed(Throwable e) {
                e.printStackTrace();
                runJS("receiveFabricVersions", "[]");
            }

            @Override
            public void cancelled() {
            }

            @Override
            public void updateProgress(long done, long total) {
            }

            @Override
            public void retry(Throwable e, int current, int max) {
            }
        });
    }

    public void fetchForgeVersions(String mcVer) {
        System.out.println("Fetching Forge for " + mcVer);
        versionManager.fetchForgeVersions(mcVer, new DownloadCallback<List<String>>() {
            @Override
            public void done(List<String> result) {
                System.out.println("Got " + result.size() + " Forge versions.");
                String json = gson.toJson(result);
                runJS("receiveForgeVersions", json);
            }

            @Override
            public void failed(Throwable e) {
                e.printStackTrace();
                runJS("receiveForgeVersions", "[]");
            }

            @Override
            public void cancelled() {
            }

            @Override
            public void updateProgress(long done, long total) {
            }

            @Override
            public void retry(Throwable e, int current, int max) {
            }
        });
    }

    // --- Launch / Install ---

    public void launchProfile(String name) {
        System.out.println("JSBridge: launchProfile called for '" + name + "'");

        // Toggle Logic: If running, stop it.
        if (launcherEngine.isRunning(name)) {
            launcherEngine.stop(name);
            runJS("setProfileState", name, "");
            return;
        }

        Profile p = profileManager.getProfile(name);

        if (p == null) {
            System.err.println("JSBridge: Profile '" + name + "' NOT FOUND in ProfileManager!");
            System.err.println("Available profiles: ");
            for (Profile prof : profileManager.getProfiles()) {
                System.err.println(" - '" + prof.getName() + "'");
            }
            sendNotification("Error: Profile not found!", "error");
            return;
        }

        sendNotification("Preparing execution...", "info");
        runJS("setProfileState", name, "installing");

        Executors.newSingleThreadExecutor().submit(() -> {
            resolveAndExecute(p, true);
        });
    }

    public void installProfile(String name) {
        System.out.println("JSBridge: installProfile called for '" + name + "'");
        Profile p = profileManager.getProfile(name);
        if (p == null) {
            System.err.println("JSBridge: Profile not found for install: " + name);
            return;
        }

        sendNotification("Starting auto-install...", "info");
        runJS("setProfileState", name, "installing");
        Executors.newSingleThreadExecutor().submit(() -> {
            resolveAndExecute(p, false);
        });
    }

    private void resolveAndExecute(Profile p, boolean launch) {
        try {
            String versionId = p.getVersion();
            String loader = p.getModLoader();
            String loaderVer = p.getLoaderVersion();

            if ("fabric".equalsIgnoreCase(loader) && loaderVer != null && !loaderVer.isEmpty()) {
                versionId = "fabric-loader-" + loaderVer + "-" + p.getVersion();
            } else if ("forge".equalsIgnoreCase(loader) && loaderVer != null && !loaderVer.isEmpty()) {
                versionId = p.getVersion() + "-forge-" + loaderVer;
            }

            final String finalVid = versionId;
            sendNotification((launch ? "Launching " : "Installing ") + finalVid + "...", "info");

            versionManager.downloadVersion(finalVid, new File(p.getGameDir()),
                    new DownloadCallback<org.to2mbn.jmccc.version.Version>() {
                        @Override
                        public void done(org.to2mbn.jmccc.version.Version v) {
                            if (launch) {
                                sendNotification("Files ready. Launching Game...", "success");
                                runJS("setProfileState", p.getName(), "running");
                                try {
                                    launcherEngine.launch(p, finalVid);
                                } catch (Exception e) {
                                    sendNotification("Launch Error: " + e.getMessage(), "error");
                                    runJS("setProfileState", p.getName(), ""); // Reset on error
                                }
                            } else {
                                sendNotification("Installation Complete!", "success");
                                runJS("setProfileState", p.getName(), ""); // Reset after install
                            }
                        }

                        @Override
                        public void failed(Throwable e) {
                            sendNotification("Download Failed: " + e.getMessage(), "error");
                            runJS("setProfileState", p.getName(), ""); // Reset on fail
                        }

                        @Override
                        public void cancelled() {
                        }

                        @Override
                        public void updateProgress(long done, long total) {
                        }

                        @Override
                        public void retry(Throwable e, int current, int max) {
                        }
                    });

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void sendNotification(String msg, String type) {
        String cleaner = msg.replace("'", "\\'").replace("\n", " ");
        runJS("showNotification", "'" + cleaner + "'", "'" + type + "'");
    }

    private void runJS(String method, Object... args) {
        if (app.webView == null || app.webView.getEngine() == null)
            return;

        StringBuilder call = new StringBuilder(method + "(");
        for (int i = 0; i < args.length; i++) {
            call.append(args[i]);
            if (i < args.length - 1)
                call.append(",");
        }
        call.append(")");

        Platform.runLater(() -> {
            try {
                app.webView.getEngine().executeScript(call.toString());
            } catch (Exception e) {
                // ignore
            }
        });
    }
}

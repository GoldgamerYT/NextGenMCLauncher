package net.gamehost24.launcher;

import com.google.gson.Gson;
import io.javalin.Javalin;
import io.javalin.http.Context;
import io.javalin.websocket.WsContext;
import net.gamehost24.launcher.core.LauncherEngine;
import net.gamehost24.launcher.core.ProfileManager;
import net.gamehost24.launcher.core.VersionManager;
import net.gamehost24.launcher.model.Profile;
import org.to2mbn.jmccc.mcdownloader.download.concurrent.DownloadCallback;
import org.to2mbn.jmccc.version.Version;

import java.io.File;
import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.lang.management.OperatingSystemMXBean;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

public class HeadlessServer {

    private static ProfileManager profileManager;
    private static LauncherEngine launcherEngine;
    private static VersionManager versionManager;
    private static net.gamehost24.launcher.core.ConfigManager configManager;
    private static final Gson gson = new Gson();

    // Track WebSocket clients to broadcast logs
    private static final Set<WsContext> wsClients = ConcurrentHashMap.newKeySet();

    public static void main(String[] args) {
        System.out.println("Starting Atlas Craft Backend...");

        // Initialize Core Components
        profileManager = new ProfileManager();
        launcherEngine = new LauncherEngine();
        versionManager = new VersionManager();
        configManager = new net.gamehost24.launcher.core.ConfigManager();

        // Start Javalin
        Javalin app = Javalin.create(config -> {
            config.bundledPlugins.enableCors(cors -> {
                cors.addRule(io.javalin.plugin.bundled.CorsPluginConfig.CorsRule::anyHost);
            });
            config.router.ignoreTrailingSlashes = true;
            config.showJavalinBanner = true;
            config.jsonMapper(new io.javalin.json.JsonMapper() {
                public String toJsonString(Object obj, java.lang.reflect.Type type) {
                    return gson.toJson(obj, type);
                }

                public <T> T fromJsonString(String json, java.lang.reflect.Type type) {
                    return gson.fromJson(json, type);
                }
            });
        }).start(35555); // Port 35555 for the launcher backend

        app.get("/", ctx -> ctx.result("Atlas Craft Backend Online"));

        System.out.println("Backend listening on http://localhost:35555");

        // --- WebSocket (For Logs & Progress) ---
        app.ws("/api/ws", ws -> {
            ws.onConnect(ctx -> {
                wsClients.add(ctx);
                System.out.println("Frontend Connected: " + ctx.sessionId());
            });
            ws.onClose(ctx -> wsClients.remove(ctx));
        });

        // --- REST API Endpoints ---

        // 0. Config
        app.get("/api/config", ctx -> {
            ctx.json(configManager.getConfig());
        });

        app.post("/api/config", ctx -> {
            try {
                net.gamehost24.launcher.model.LauncherConfig newConfig = gson.fromJson(ctx.body(),
                        net.gamehost24.launcher.model.LauncherConfig.class);
                configManager.updateConfig(newConfig);
                ctx.json(newConfig);
            } catch (Exception e) {
                ctx.status(500).result(e.getMessage());
            }
        });

        // 1. Get Profiles
        app.get("/api/profiles", ctx -> {
            ctx.json(profileManager.getProfiles());
        });

        // 2. Create Profile
        app.post("/api/profiles", ctx -> {
            try {
                Profile newProfile = gson.fromJson(ctx.body(), Profile.class);
                if (newProfile.getName() == null || newProfile.getName().isEmpty()) {
                    ctx.status(400).result("Name required");
                    return;
                }

                // Defaults
                if (newProfile.getIcon() == null)
                    newProfile.setIcon("Box");

                // Set default Game Directory if missing
                if (newProfile.getGameDir() == null || newProfile.getGameDir().isEmpty()) {
                    newProfile.setGameDir("profiles/" + newProfile.getName());
                }

                // Use Default RAM if not specified
                if (newProfile.getRamMb() <= 0) {
                    newProfile.setRamMb(configManager.getConfig().getDefaultRamMb());
                    System.out.println("Using Default RAM: " + newProfile.getRamMb());
                }

                profileManager.addProfile(newProfile);

                // Auto-install (Async)
                installProfileAsync(newProfile.getName());

                ctx.status(201).json(newProfile);
            } catch (Exception e) {
                e.printStackTrace(); // Print the actual error
                ctx.status(500).result("Error: " + (e.getMessage() != null ? e.getMessage() : e.toString()));
            }
        });

        // 3. Delete Profile
        app.delete("/api/profiles/{name}", ctx -> {
            String name = ctx.pathParam("name");
            Profile p = profileManager.getProfile(name);
            if (p != null) {
                // Stop if running
                if (launcherEngine.isRunning(name)) {
                    launcherEngine.stop(name);
                    broadcast("status", name, "stopped");
                }
                profileManager.removeProfile(p);
                ctx.status(204);
            } else {
                ctx.status(404);
            }
        });

        // 4. Update Profile (RAM, Version, Loader, etc)
        app.put("/api/profiles/{name}", ctx -> {
            String name = ctx.pathParam("name");
            Profile p = profileManager.getProfile(name);
            if (p != null) {
                Profile update = gson.fromJson(ctx.body(), Profile.class);
                p.setRamMb(update.getRamMb());
                p.setJavaPath(update.getJavaPath());
                p.setVersion(update.getVersion());
                p.setModLoader(update.getModLoader());
                p.setLoaderVersion(update.getLoaderVersion());
                p.setIconPath(update.getIconPath()); // Update Icon Path
                
                profileManager.saveProfiles();
                ctx.json(p);
            } else {
                ctx.status(404);
            }
        });

        // 4.5 Pick File (Native Dialog)
        app.post("/api/sys/pick-file", ctx -> {
            java.util.concurrent.CompletableFuture<String> future = new java.util.concurrent.CompletableFuture<>();
            
            // Run on Swing Thread to be safe
            javax.swing.SwingUtilities.invokeLater(() -> {
                javax.swing.JFileChooser chooser = new javax.swing.JFileChooser();
                chooser.setDialogTitle("Select Profile Icon");
                chooser.setFileFilter(new javax.swing.filechooser.FileNameExtensionFilter("Images", "png", "jpg", "jpeg", "gif"));
                int result = chooser.showOpenDialog(null);
                if (result == javax.swing.JFileChooser.APPROVE_OPTION) {
                     future.complete(chooser.getSelectedFile().getAbsolutePath());
                } else {
                     future.complete(null);
                }
            });

            String path = future.get(); // Wait for user selection
            if (path != null) {
                ctx.result(path);
            } else {
                ctx.status(204); // No content (cancelled)
            }
        });

        // 4b. Reinstall Profile
        app.post("/api/profiles/{name}/reinstall", ctx -> {
            String name = ctx.pathParam("name");
            if (profileManager.getProfile(name) != null) {
                installProfileAsync(name);
                ctx.status(200).result("Reinstall initiated");
            } else {
                ctx.status(404);
            }
        });

        // 4b. Open Folder
        app.post("/api/profiles/{name}/folder", ctx -> {
            String name = ctx.pathParam("name");
            Profile p = profileManager.getProfile(name);
            if (p != null) {
                File dir = new File(p.getGameDir());
                if (!dir.exists())
                    dir.mkdirs();
                try {
                    java.awt.Desktop.getDesktop().open(dir);
                    ctx.status(200);
                } catch (Exception e) {
                    ctx.status(500).result(e.getMessage());
                }
            } else {
                ctx.status(404);
            }
        });

        // 4c. Get Profile Icon
        app.get("/api/profiles/{name}/icon", ctx -> {
            String name = ctx.pathParam("name");
            Profile p = profileManager.getProfile(name);
            if (p != null && p.getIconPath() != null) {
                File f = new File(p.getIconPath());
                if (f.exists()) {
                    ctx.contentType("image/png"); // Simplification, ideally detect type
                    ctx.result(new java.io.FileInputStream(f));
                } else {
                    ctx.status(404);
                }
            } else {
                ctx.status(404);
            }
        });

        // 5. Mod Management
        // 5a. Install Mod (Download URL)
        app.post("/api/profiles/{name}/mods", ctx -> {
            String name = ctx.pathParam("name");
            Profile p = profileManager.getProfile(name);
            if (p != null) {
                try {
                    ModDownloadRequest req = gson.fromJson(ctx.body(), ModDownloadRequest.class);
                    if (req.url == null || req.fileName == null) {
                        ctx.status(400).result("URL and FileName required");
                        return;
                    }

                    File modsDir = new File(p.getGameDir(), "mods");
                    if (!modsDir.exists()) modsDir.mkdirs();

                    File targetFile = new File(modsDir, req.fileName);

                    // Allow client to know it's starting
                    ctx.status(202).result("Download Started");

                    // Async Download
                    Executors.newSingleThreadExecutor().submit(() -> {
                         try {
                             broadcast("status", name, "downloading_mod"); // Custom status if needed
                             broadcast("log", name, "Downloading mod: " + req.fileName);
                             
                             java.net.URL url = new java.net.URL(req.url);
                             java.nio.file.Files.copy(
                                 url.openStream(), 
                                 targetFile.toPath(), 
                                 java.nio.file.StandardCopyOption.REPLACE_EXISTING
                             );
                             
                             broadcast("log", name, "Installed: " + req.fileName);
                             broadcast("mod_installed", name, req.fileName); // Event for frontend to updating
                         } catch (Exception e) {
                             e.printStackTrace();
                             broadcast("error", name, "Failed to download " + req.fileName + ": " + e.getMessage());
                         }
                    });

                } catch (Exception e) {
                    ctx.status(500).result(e.getMessage());
                }
            } else {
                ctx.status(404);
            }
        });

        // 5b. List Installed Mods (Detailed with Hashes)
        app.get("/api/profiles/{name}/mods", ctx -> {
             String name = ctx.pathParam("name");
             Profile p = profileManager.getProfile(name);
             if (p != null) {
                 File modsDir = new File(p.getGameDir(), "mods");
                 if (modsDir.exists()) {
                     String[] files = modsDir.list((dir, fname) -> fname.endsWith(".jar") || fname.endsWith(".disabled"));
                     ctx.json(files != null ? files : new String[0]);
                 } else {
                     ctx.json(new String[0]);
                 }
             } else {
                 ctx.status(404);
             }
        });

        app.get("/api/profiles/{name}/mods/detailed", ctx -> {
             String name = ctx.pathParam("name");
             Profile p = profileManager.getProfile(name);
             if (p != null) {
                 File modsDir = new File(p.getGameDir(), "mods");
                 if (!modsDir.exists()) modsDir.mkdirs();
                 
                 File[] files = modsDir.listFiles((dir, fname) -> fname.endsWith(".jar") || fname.endsWith(".disabled"));
                 java.util.List<ModFile> modFiles = new java.util.ArrayList<>();
                 
                 if (files != null) {
                     for (File f : files) {
                         boolean enabled = f.getName().endsWith(".jar");
                         String sha1 = enabled ? getSHA1(f) : null; // Only hash jars for now, or hash disabled too? Modrinth needs SHA1 of jar.
                         if (!enabled) {
                             // If disabled, we might want to peek inside or hash it too if we want to ID it. 
                             // But usually Modrinth ID is by file hash. Users might rename disabled files.
                             // Let's hash it anyway if we can.
                             sha1 = getSHA1(f);
                         }
                         modFiles.add(new ModFile(f.getName(), sha1, f.length(), enabled));
                     }
                 }
                 ctx.json(modFiles);
             } else {
                 ctx.status(404);
             }
        });

        // 5d. Toggle Mod (Rename .jar <-> .disabled)
        app.post("/api/profiles/{name}/mods/{filename}/toggle", ctx -> {
             String name = ctx.pathParam("name");
             String filename = ctx.pathParam("filename");
             Profile p = profileManager.getProfile(name);
             
             if (p != null) {
                 File modsDir = new File(p.getGameDir(), "mods");
                 File file = new File(modsDir, filename);
                 
                 if (file.exists() && file.getParentFile().equals(modsDir)) {
                     boolean isEnabled = filename.endsWith(".jar");
                     String newName = isEnabled ? filename + ".disabled" : filename.replace(".disabled", "");
                     
                     // If enabling, ensure it ends with .jar (handle wierd cases)
                     if (!isEnabled && !newName.endsWith(".jar")) newName += ".jar";

                     File newFile = new File(modsDir, newName);
                     if (file.renameTo(newFile)) {
                         ctx.json(new ModFile(newName, null, newFile.length(), !isEnabled));
                         broadcast("log", name, "Toggled mod: " + filename + " -> " + newName);
                     } else {
                         ctx.status(500).result("Failed to rename file");
                     }
                 } else {
                     ctx.status(404).result("File not found");
                 }
             } else {
                 ctx.status(404);
             }
        });

        // 5c. Delete Mod
        app.delete("/api/profiles/{name}/mods/{filename}", ctx -> {
             String name = ctx.pathParam("name");
             String filename = ctx.pathParam("filename");
             Profile p = profileManager.getProfile(name);
             if (p != null) {
                 File modsDir = new File(p.getGameDir(), "mods");
                 File modFile = new File(modsDir, filename);
                 
                 // Security check to prevent leaving mods dir
                 if (modFile.getParentFile().equals(modsDir) && modFile.exists()) {
                     if (modFile.delete()) {
                         ctx.status(204);
                         broadcast("log", name, "Deleted old mod: " + filename);
                     } else {
                         ctx.status(500).result("Failed to delete");
                     }
                 } else {
                     ctx.status(404).result("File not found");
                 }
             } else {
                 ctx.status(404);
             }
        });

        // 6. Launch Profile
        app.post("/api/launch/{name}", ctx -> {
            String name = ctx.pathParam("name");
            Profile p = profileManager.getProfile(name);
            if (p == null) {
                ctx.status(404).result("Profile not found");
                return;
            }

            if (launcherEngine.isRunning(name)) {
                // If running, stop it (act as toggle)
                launcherEngine.stop(name);
                broadcast("status", name, "stopped");
                ctx.result("Stopped");
                return;
            }

            // Start Launch
            launchProfileAsync(p);
            ctx.result("Launch Initiated");
        });

        // 6. System Info
        app.get("/api/system/memory", ctx -> {
            long memory = ((com.sun.management.OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean())
                    .getTotalPhysicalMemorySize();
            ctx.result(String.valueOf(memory));
        });

        // 7. Versions (Proxy to internal manager)
        app.get("/api/versions/game", ctx -> {
            // We need to wrap the async fetch in a future or handle it.
            // For simplicity, we'll fetch eagerly or use blocking for this specific
            // endpoint response?
            // Or better, just trigger an async fetch and assume client listens to WS?
            // Let's block for simplicity on this GET.

            java.util.concurrent.CompletableFuture<List<String>> future = new java.util.concurrent.CompletableFuture<>();
            versionManager.fetchGameVersions(new DownloadCallback<List<String>>() {
                public void done(List<String> r) {
                    future.complete(r);
                }

                public void failed(Throwable t) {
                    future.completeExceptionally(t);
                }

                public void cancelled() {
                }

                public void updateProgress(long d, long t) {
                }

                public void retry(Throwable e, int c, int m) {
                }
            });

            try {
                ctx.json(future.get());
            } catch (Exception e) {
                ctx.status(500).result(e.getMessage());
            }
        });

        // 8. Loader Versions (Fabric/Forge)
        app.get("/api/versions/loader/{type}/{version}", ctx -> {
            String type = ctx.pathParam("type");
            String mcVersion = ctx.pathParam("version");

            java.util.concurrent.CompletableFuture<List<String>> future = new java.util.concurrent.CompletableFuture<>();

            if ("fabric".equalsIgnoreCase(type)) {
                versionManager.fetchFabricLoaderVersions(mcVersion, new DownloadCallback<List<String>>() {
                    public void done(List<String> r) {
                        future.complete(r);
                    }

                    public void failed(Throwable t) {
                        future.completeExceptionally(t);
                    }

                    public void cancelled() {
                    }

                    public void updateProgress(long d, long t) {
                    }

                    public void retry(Throwable e, int c, int m) {
                    }
                });
            } else if ("forge".equalsIgnoreCase(type)) {
                versionManager.fetchForgeVersions(mcVersion, new DownloadCallback<List<String>>() {
                    public void done(List<String> r) {
                        future.complete(r);
                    }

                    public void failed(Throwable t) {
                        future.completeExceptionally(t);
                    }

                    public void cancelled() {
                    }

                    public void updateProgress(long d, long t) {
                    }

                    public void retry(Throwable e, int c, int m) {
                    }
                });
            } else {
                ctx.json(java.util.Collections.emptyList());
                return;
            }

            try {
                ctx.json(future.get());
            } catch (Exception e) {
                ctx.status(500).result(e.getMessage());
            }
        });
    }

    // --- Helpers ---

    private static void installProfileAsync(String name) {
        Profile p = profileManager.getProfile(name);
        if (p == null)
            return;

        broadcast("status", name, "installing");
        Executors.newSingleThreadExecutor().submit(() -> {
            resolveAndExecute(p, false);
        });
    }

    private static void launchProfileAsync(Profile p) {
        broadcast("status", p.getName(), "installing"); // "Installing/Loading" state
        Executors.newSingleThreadExecutor().submit(() -> {
            resolveAndExecute(p, true);
        });
    }

    private static void resolveAndExecute(Profile p, boolean launch) {
        try {
            String versionId = p.getVersion();
            // ... (Same logic as JSBridge) ...
            String loader = p.getModLoader();
            String loaderVer = p.getLoaderVersion();

            if ("fabric".equalsIgnoreCase(loader) && loaderVer != null && !loaderVer.isEmpty()) {
                versionId = "fabric-loader-" + loaderVer + "-" + p.getVersion();
            } else if ("forge".equalsIgnoreCase(loader) && loaderVer != null && !loaderVer.isEmpty()) {
                versionId = p.getVersion() + "-forge-" + loaderVer;
            }

            final String finalVid = versionId;
            broadcast("log", p.getName(), "Checking version: " + finalVid);

            versionManager.downloadVersion(finalVid, new File(p.getGameDir()), new DownloadCallback<Version>() {
                @Override
                public void done(Version v) {
                    if (launch) {
                        broadcast("status", p.getName(), "running");
                        broadcast("log", p.getName(), "Launching Game...");
                        try {
                            launcherEngine.launch(p, finalVid, new org.to2mbn.jmccc.launch.ProcessListener() {
                                @Override
                                public void onLog(String log) {
                                    broadcast("log", p.getName(), log);
                                }

                                @Override
                                public void onErrorLog(String log) {
                                    broadcast("error", p.getName(), log);
                                }

                                @Override
                                public void onExit(int code) {
                                    broadcast("status", p.getName(), "stopped");
                                    broadcast("log", p.getName(), "Exited with code " + code);
                                }
                            });
                        } catch (Exception e) {
                            broadcast("status", p.getName(), "stopped");
                            broadcast("error", p.getName(), e.getMessage());
                        }
                    } else {
                        broadcast("status", p.getName(), "stopped");
                        broadcast("log", p.getName(), "Install Complete");
                    }
                }

                @Override
                public void failed(Throwable e) {
                    broadcast("status", p.getName(), "stopped");
                    broadcast("error", p.getName(), "Download Failed: " + e.getMessage());
                }

                public void cancelled() {
                }

                public void updateProgress(long done, long total) {
                    // Optional: broadcast download progress
                }

                public void retry(Throwable e, int c, int m) {
                }
            });

        } catch (Exception e) {
            e.printStackTrace();
            broadcast("error", p.getName(), e.getMessage());
        }
    }

    // Broadcasts JSON message to all connected clients
    // Message Format: { type: "status"|"log"|"error", profile: "name", payload:
    // "data" }
    public static void broadcast(String type, String profile, String payload) {
        String json = gson.toJson(new WsMessage(type, profile, payload));
        wsClients.forEach(ctx -> {
            if (ctx.session.isOpen())
                ctx.send(json);
        });
    }

    static class WsMessage {
        String type;
        String profile;
        String payload;

        public WsMessage(String t, String p, String d) {
            this.type = t;
            this.profile = p;
            this.payload = d;
        }
    }

    static class ModDownloadRequest {
        String url;
        String fileName;
    }

    static class ModFile {
        String fileName;
        String sha1;
        long size;
        boolean enabled;

        public ModFile(String f, String s, long sz, boolean e) {
            this.fileName = f; this.sha1 = s; this.size = sz; this.enabled = e;
        }
    }

    private static String getSHA1(File file) {
        try (java.io.InputStream dis = new java.io.FileInputStream(file)) {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-1");
            byte[] buffer = new byte[8192];
            int n = 0;
            while ((n = dis.read(buffer)) != -1) {
                digest.update(buffer, 0, n);
            }
            byte[] hash = digest.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }
}

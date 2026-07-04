package net.gamehost24.launcher;

import com.google.gson.Gson;
import io.javalin.Javalin;
import io.javalin.websocket.WsContext;
import net.gamehost24.launcher.core.*;
import net.gamehost24.launcher.core.MicrosoftAuthService;
import net.gamehost24.launcher.core.JavaInstaller;
import net.gamehost24.launcher.model.*;
import org.to2mbn.jmccc.mcdownloader.download.concurrent.DownloadCallback;
import org.to2mbn.jmccc.version.Version;

import java.io.File;
import java.lang.management.ManagementFactory;
import java.util.*;
import java.util.concurrent.*;

public class HeadlessServer {

    // ── Core services ─────────────────────────────────────────────────────────

    private static ProfileManager   profileManager;
    private static LauncherEngine   launcherEngine;
    private static VersionManager   versionManager;
    private static ConfigManager    configManager;
    private static LogService       logService;

    private static final Gson gson = new Gson();

    // WS clients — shared with LogService so it can broadcast directly
    private static final Set<WsContext> wsClients = ConcurrentHashMap.newKeySet();

    // Profiles currently downloading/installing — prevents double-launch race
    private static final Set<String> installingProfiles = ConcurrentHashMap.newKeySet();

    // ── App data dir (mirrors Electron's userData) ────────────────────────────

    private static final File APP_DATA_DIR;
    static {
        String os = System.getProperty("os.name", "").toLowerCase();
        if (os.contains("win")) {
            String appData = System.getenv("APPDATA");
            if (appData == null || appData.isBlank())
                appData = System.getProperty("user.home") + "\\AppData\\Roaming";
            APP_DATA_DIR = new File(appData, "AtlasCraft");
        } else {
            APP_DATA_DIR = new File(System.getProperty("user.home"), ".atlascraft");
        }
        APP_DATA_DIR.mkdirs();
    }

    // ── main ──────────────────────────────────────────────────────────────────

    public static void main(String[] args) {
        // 1. Init LogService first so everything that follows can log
        logService = LogService.init(APP_DATA_DIR, wsClients);
        logService.info("Backend", "Atlas Craft Backend starting…");

        // 2. Core services
        configManager  = new ConfigManager(APP_DATA_DIR);
        profileManager = new ProfileManager();
        versionManager = new VersionManager();
        launcherEngine = new LauncherEngine();
        launcherEngine.setConfig(configManager.getConfig());
        AccountService.init(APP_DATA_DIR);

        logService.info("Backend", "Services initialised — data dir: " + APP_DATA_DIR);

        // Pre-install Java 8, 17, 21 in background so they're ready on first launch
        new net.gamehost24.launcher.core.JavaManager().preInstallAllVersionsAsync();

        // 3. Javalin — retry up to 3 times in case the port was just released by a dying process
        Javalin app = null;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                app = Javalin.create(cfg -> {
                    cfg.bundledPlugins.enableCors(cors ->
                        cors.addRule(io.javalin.plugin.bundled.CorsPluginConfig.CorsRule::anyHost));
                    cfg.router.ignoreTrailingSlashes = true;
                    cfg.showJavalinBanner            = false;
                    cfg.jsonMapper(new io.javalin.json.JsonMapper() {
                        public String toJsonString(Object obj, java.lang.reflect.Type type) { return gson.toJson(obj, type); }
                        public <T> T fromJsonString(String json, java.lang.reflect.Type type) { return gson.fromJson(json, type); }
                    });
                }).start(35555);
                break;
            } catch (Exception e) {
                if (attempt == 3) {
                    logService.error("Backend", null, "Cannot bind port 35555 after 3 attempts — " + e.getMessage());
                    System.exit(99);
                    return;
                }
                logService.warn("Backend", null, "Port 35555 busy, retrying in 1s (attempt " + attempt + "/3)…");
                try { Thread.sleep(1000); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            }
        }

        registerRoutes(app);

        logService.info("Backend", "HTTP server listening on http://localhost:35555");

        // Shutdown hook
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            logService.info("Backend", "Shutting down…");
            logService.shutdown();
        }));
    }

    // ── Route registration ────────────────────────────────────────────────────

    private static void registerRoutes(Javalin app) {

        // ── Health ────────────────────────────────────────────────────────────
        app.get("/", ctx -> ctx.result("Atlas Craft Backend Online"));

        app.get("/api/health", ctx -> {
            Map<String, Object> status = new LinkedHashMap<>();
            status.put("status",   "ok");
            status.put("version",  "1.0.0");
            status.put("running",  launcherEngine.getRunningProfiles());
            status.put("profiles", profileManager.getProfiles().size());
            ctx.json(status);
        });

        // ── Java check ────────────────────────────────────────────────────────
        app.get("/api/java/check", ctx -> {
            String javaPath = ctx.queryParam("path");
            Map<String, Object> result = new LinkedHashMap<>();
            try {
                String exe = (javaPath != null && !javaPath.isBlank()) ? javaPath : "java";
                ProcessBuilder pb = new ProcessBuilder(exe, "-version");
                pb.redirectErrorStream(true);
                Process p = pb.start();
                String out = new String(p.getInputStream().readAllBytes());
                boolean ok = p.waitFor(5, TimeUnit.SECONDS) && p.exitValue() == 0;
                result.put("ok",      ok);
                result.put("version", out.trim());
            } catch (Exception e) {
                result.put("ok",    false);
                result.put("error", e.getMessage());
            }
            ctx.json(result);
        });

        // ── WebSocket ─────────────────────────────────────────────────────────
        app.ws("/api/ws", ws -> {
            ws.onConnect(ctx -> {
                wsClients.add(ctx);
                logService.debug("Backend", "WS client connected: " + ctx.sessionId());
                // Send recent log history to the new client
                logService.sendHistoryToClient(ctx);
            });
            ws.onClose(ctx -> {
                wsClients.remove(ctx);
                logService.debug("Backend", "WS client disconnected: " + ctx.sessionId());
            });
            ws.onError(ctx -> wsClients.remove(ctx));
        });

        // ── Config ────────────────────────────────────────────────────────────
        app.get("/api/config", ctx -> ctx.json(configManager.getConfig()));

        app.post("/api/config", ctx -> {
            try {
                LauncherConfig newCfg = gson.fromJson(ctx.body(), LauncherConfig.class);
                configManager.updateConfig(newCfg);
                launcherEngine.setConfig(newCfg);
                logService.info("Backend", "Config updated");
                ctx.json(newCfg);
            } catch (Exception e) {
                logService.error("Backend", null, "Config update failed: " + e.getMessage());
                ctx.status(500).result(e.getMessage());
            }
        });

        // ── Profiles — CRUD ───────────────────────────────────────────────────
        app.get("/api/profiles", ctx -> ctx.json(profileManager.getProfiles()));

        app.post("/api/profiles", ctx -> {
            try {
                Profile p = gson.fromJson(ctx.body(), Profile.class);
                if (p.getName() == null || p.getName().isBlank()) {
                    ctx.status(400).result("Name required"); return;
                }
                if (p.getIcon() == null) p.setIcon("Box");
                if (p.getRamMb() <= 0)  p.setRamMb(configManager.getConfig().getDefaultRamMb());

                profileManager.addProfile(p);
                logService.info("Launcher", "Profile created: " + p.getName());
                installProfileAsync(p.getName());
                ctx.status(201).json(p);
            } catch (Exception e) {
                logService.error("Backend", null, "Create profile error: " + e.getMessage());
                ctx.status(500).result("Error: " + e.getMessage());
            }
        });

        app.put("/api/profiles/{name}", ctx -> {
            String name = ctx.pathParam("name");
            Profile existing = profileManager.getProfile(name);
            if (existing == null) {
                logService.warn("Backend", null, "PUT /api/profiles/" + name + " — profile not found");
                ctx.status(404).result("Profile not found: " + name);
                return;
            }
            try {
                Profile update = gson.fromJson(ctx.body(), Profile.class);
                logService.info("Launcher", name, "Saving profile settings — useGlobalRam=" + update.isUseGlobalRam()
                    + " ramMb=" + update.getRamMb() + " profileMinRamMb=" + update.getProfileMinRamMb());
                existing.setRamMb(update.getRamMb());
                existing.setJavaPath(update.getJavaPath());
                existing.setVersion(update.getVersion());
                existing.setModLoader(update.getModLoader());
                existing.setLoaderVersion(update.getLoaderVersion());
                existing.setIconPath(update.getIconPath());
                existing.setUseGlobalRam(update.isUseGlobalRam());
                existing.setProfileMinRamMb(update.getProfileMinRamMb());
                profileManager.saveProfiles();
                logService.info("Launcher", name, "Profile saved successfully");
                ctx.json(existing);
            } catch (Exception e) {
                logService.error("Backend", name, "Failed to save profile: " + e.getMessage());
                ctx.status(500).result("Failed to save profile: " + e.getMessage());
            }
        });

        app.delete("/api/profiles/{name}", ctx -> {
            String name = ctx.pathParam("name");
            Profile p = profileManager.getProfile(name);
            if (p == null) { ctx.status(404); return; }
            if (launcherEngine.isRunning(name)) {
                launcherEngine.stop(name);
                broadcastStatus(name, "stopped");
            }
            profileManager.removeProfile(p);
            logService.info("Launcher", "Profile deleted: " + name);
            ctx.status(204);
        });

        // Duplicate profile
        app.post("/api/profiles/{name}/duplicate", ctx -> {
            String name = ctx.pathParam("name");
            Profile src = profileManager.getProfile(name);
            if (src == null) { ctx.status(404).result("Profile not found"); return; }
            try {
                String newName = findUniqueName(name + "-copy");
                Profile copy = new Profile(newName, src.getVersion(), src.getModLoader(),
                    src.getRamMb(), src.getJavaPath(), "", src.getIconPath());
                copy.setLoaderVersion(src.getLoaderVersion());
                copy.setCardColor(src.getCardColor());
                copy.setUseGlobalRam(src.isUseGlobalRam());
                copy.setProfileMinRamMb(src.getProfileMinRamMb());
                profileManager.addProfile(copy);
                logService.info("Launcher", "Profile duplicated: " + name + " → " + newName);
                installProfileAsync(newName);
                ctx.status(201).json(copy);
            } catch (Exception e) {
                ctx.status(500).result(e.getMessage());
            }
        });

        // Reinstall
        app.post("/api/profiles/{name}/reinstall", ctx -> {
            String name = ctx.pathParam("name");
            if (profileManager.getProfile(name) == null) { ctx.status(404); return; }
            logService.info("Launcher", name, "Reinstall initiated");
            installProfileAsync(name);
            ctx.status(200).result("Reinstall initiated");
        });

        // Open folder
        app.post("/api/profiles/{name}/folder", ctx -> {
            String name = ctx.pathParam("name");
            Profile p = profileManager.getProfile(name);
            if (p == null) { ctx.status(404); return; }
            File dir = new File(p.getGameDir());
            dir.mkdirs();
            try {
                java.awt.Desktop.getDesktop().open(dir);
                ctx.status(200);
            } catch (Exception e) {
                ctx.status(500).result(e.getMessage());
            }
        });

        // Open mods folder
        app.post("/api/profiles/{name}/mods/folder", ctx -> {
            String name = ctx.pathParam("name");
            Profile p = profileManager.getProfile(name);
            if (p == null) { ctx.status(404); return; }
            File modsDir = new File(p.getGameDir(), "mods");
            modsDir.mkdirs();
            try {
                String os = System.getProperty("os.name", "").toLowerCase();
                ProcessBuilder pb;
                if (os.contains("win")) pb = new ProcessBuilder("explorer.exe", modsDir.getAbsolutePath());
                else if (os.contains("mac"))  pb = new ProcessBuilder("open", modsDir.getAbsolutePath());
                else                          pb = new ProcessBuilder("xdg-open", modsDir.getAbsolutePath());
                pb.start();
                ctx.status(200);
            } catch (Exception e) { ctx.status(500).result(e.getMessage()); }
        });

        // Get mods folder path
        app.get("/api/profiles/{name}/mods/path", ctx -> {
            String name = ctx.pathParam("name");
            Profile p = profileManager.getProfile(name);
            if (p == null) { ctx.status(404); return; }
            File modsDir = new File(p.getGameDir(), "mods");
            modsDir.mkdirs();
            ctx.json(modsDir.getAbsolutePath());
        });

        // Import local mod file (from drag & drop)
        app.post("/api/profiles/{name}/mods/import", ctx -> {
            String name = ctx.pathParam("name");
            Profile p = profileManager.getProfile(name);
            if (p == null) { ctx.status(404); return; }
            var req = ctx.bodyAsClass(ImportModRequest.class);
            File src = new File(req.sourcePath);
            if (!src.exists()) { ctx.status(400).result("Source file not found"); return; }
            File modsDir = new File(p.getGameDir(), "mods");
            modsDir.mkdirs();
            File dest = new File(modsDir, src.getName());
            java.nio.file.Files.copy(src.toPath(), dest.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            ctx.status(200).json(java.util.Map.of("fileName", dest.getName()));
        });

        // Icon
        app.get("/api/profiles/{name}/icon", ctx -> {
            String name = ctx.pathParam("name");
            Profile p = profileManager.getProfile(name);
            if (p != null && p.getIconPath() != null) {
                File f = new File(p.getIconPath());
                if (f.exists()) {
                    ctx.contentType("image/png");
                    ctx.result(new java.io.FileInputStream(f));
                    return;
                }
            }
            ctx.status(404);
        });

        // File picker (legacy)
        app.post("/api/sys/pick-file", ctx -> {
            CompletableFuture<String> future = new CompletableFuture<>();
            javax.swing.SwingUtilities.invokeLater(() -> {
                javax.swing.JFileChooser chooser = new javax.swing.JFileChooser();
                chooser.setFileFilter(new javax.swing.filechooser.FileNameExtensionFilter(
                    "Images", "png", "jpg", "jpeg", "gif"));
                int result = chooser.showOpenDialog(null);
                future.complete(result == javax.swing.JFileChooser.APPROVE_OPTION
                    ? chooser.getSelectedFile().getAbsolutePath() : null);
            });
            String path = future.get();
            if (path != null) ctx.result(path); else ctx.status(204);
        });

        // ── Mods ──────────────────────────────────────────────────────────────
        app.post("/api/profiles/{name}/mods", ctx -> {
            String name = ctx.pathParam("name");
            Profile p = profileManager.getProfile(name);
            if (p == null) { ctx.status(404); return; }
            try {
                ModDownloadRequest req = gson.fromJson(ctx.body(), ModDownloadRequest.class);
                if (req.url == null || req.fileName == null) {
                    ctx.status(400).result("URL and fileName required"); return;
                }
                File modsDir = new File(p.getGameDir(), "mods");
                modsDir.mkdirs();
                File target = new File(modsDir, req.fileName);
                ctx.status(202).result("Download started");

                Executors.newSingleThreadExecutor().submit(() -> {
                    try {
                        logService.info("Launcher", name, "Downloading mod: " + req.fileName);
                        java.net.URL url = new java.net.URL(req.url);
                        java.nio.file.Files.copy(url.openStream(), target.toPath(),
                            java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                        logService.info("Launcher", name, "Mod installed: " + req.fileName);
                        broadcastEvent("mod_installed", name, req.fileName);
                    } catch (Exception e) {
                        logService.error("Launcher", name, "Mod download failed: " + e.getMessage());
                    }
                });
            } catch (Exception e) {
                ctx.status(500).result(e.getMessage());
            }
        });

        app.get("/api/profiles/{name}/mods", ctx -> {
            Profile p = profileManager.getProfile(ctx.pathParam("name"));
            if (p == null) { ctx.status(404); return; }
            File modsDir = new File(p.getGameDir(), "mods");
            if (!modsDir.exists()) { ctx.json(new String[0]); return; }
            String[] files = modsDir.list((d, n) -> n.endsWith(".jar") || n.endsWith(".disabled"));
            ctx.json(files != null ? files : new String[0]);
        });

        app.get("/api/profiles/{name}/mods/detailed", ctx -> {
            Profile p = profileManager.getProfile(ctx.pathParam("name"));
            if (p == null) { ctx.status(404); return; }
            File modsDir = new File(p.getGameDir(), "mods");
            modsDir.mkdirs();
            File[] files = modsDir.listFiles((d, n) -> n.endsWith(".jar") || n.endsWith(".disabled"));
            List<ModFile> result = new ArrayList<>();
            if (files != null) {
                for (File f : files) {
                    boolean enabled = f.getName().endsWith(".jar");
                    result.add(new ModFile(f.getName(), getSHA1(f), f.length(), enabled));
                }
            }
            ctx.json(result);
        });

        app.post("/api/profiles/{name}/mods/{filename}/toggle", ctx -> {
            Profile p = profileManager.getProfile(ctx.pathParam("name"));
            if (p == null) { ctx.status(404); return; }
            File modsDir = new File(p.getGameDir(), "mods");
            File file = new File(modsDir, ctx.pathParam("filename"));
            if (!file.getParentFile().getCanonicalPath().equals(modsDir.getCanonicalPath())) {
                ctx.status(403).result("Path traversal denied"); return;
            }
            if (!file.exists()) { ctx.status(404).result("File not found"); return; }
            boolean isEnabled = file.getName().endsWith(".jar");
            String newName = isEnabled
                ? file.getName() + ".disabled"
                : file.getName().replace(".disabled", "");
            if (!newName.endsWith(".jar") && !newName.endsWith(".disabled")) newName += ".jar";
            File newFile = new File(modsDir, newName);
            if (file.renameTo(newFile)) {
                ctx.json(new ModFile(newName, null, newFile.length(), !isEnabled));
            } else {
                ctx.status(500).result("Rename failed");
            }
        });

        app.delete("/api/profiles/{name}/mods/{filename}", ctx -> {
            Profile p = profileManager.getProfile(ctx.pathParam("name"));
            if (p == null) { ctx.status(404); return; }
            File modsDir = new File(p.getGameDir(), "mods");
            File modFile = new File(modsDir, ctx.pathParam("filename"));
            if (!modFile.getCanonicalPath().startsWith(modsDir.getCanonicalPath())) {
                ctx.status(403).result("Path traversal denied"); return;
            }
            if (!modFile.exists()) { ctx.status(404).result("Not found"); return; }
            if (modFile.delete()) ctx.status(204);
            else ctx.status(500).result("Delete failed");
        });

        // ── Launch / Stop ─────────────────────────────────────────────────────
        app.post("/api/launch/{name}", ctx -> {
            String name = ctx.pathParam("name");
            Profile p = profileManager.getProfile(name);
            if (p == null) { ctx.status(404).result("Profile not found"); return; }

            if (launcherEngine.isRunning(name)) {
                launcherEngine.stop(name);
                broadcastStatus(name, "stopped");
                ctx.result("Stopped");
                return;
            }

            if (installingProfiles.contains(name)) {
                ctx.result("Already installing");
                return;
            }

            launchProfileAsync(p);
            ctx.result("Launch initiated");
        });

        // ── Logs ──────────────────────────────────────────────────────────────

        // Full history (last 2000 entries)
        app.get("/api/logs/history", ctx -> {
            String limitParam = ctx.queryParam("limit");
            int limit = 2000;
            try { if (limitParam != null) limit = Integer.parseInt(limitParam); } catch (NumberFormatException ignored) {}
            ctx.json(logService.getHistory(limit));
        });

        // Instance-specific history
        app.get("/api/logs/instance/{name}", ctx -> {
            ctx.json(logService.getInstanceHistory(ctx.pathParam("name")));
        });

        // Clear view (does NOT delete files — just a hook for clients)
        app.post("/api/logs/clear-view", ctx -> ctx.status(200).result("ok"));

        // ── System ────────────────────────────────────────────────────────────
        app.get("/api/system/memory", ctx -> {
            long memory = ((com.sun.management.OperatingSystemMXBean)
                ManagementFactory.getOperatingSystemMXBean()).getTotalPhysicalMemorySize();
            ctx.result(String.valueOf(memory));
        });

        // ── Cache / Temp clear ────────────────────────────────────────────────
        app.post("/api/cache/clear", ctx -> {
            logService.info("Launcher", "Clearing download cache…");
            // jmccc cache is in the .minecraft-like dirs inside each profile, not a central dir
            // We delete .fabric/processedMods and similar ephemeral dirs
            int deleted = clearCacheForAllProfiles();
            logService.info("Launcher", "Cache cleared — " + deleted + " entries removed");
            ctx.json(Map.of("ok", true, "deleted", deleted));
        });

        app.post("/api/temp/clear", ctx -> {
            logService.info("Launcher", "Clearing temporary files…");
            File tempDir = new File(APP_DATA_DIR, "temp");
            int deleted = deleteDirectory(tempDir);
            logService.info("Launcher", "Temp cleared — " + deleted + " files removed");
            ctx.json(Map.of("ok", true, "deleted", deleted));
        });

        // ── Account management ────────────────────────────────────────────────
        // GET  /api/accounts         → list all accounts (public, no tokens)
        // GET  /api/account          → active account or 404
        // POST /api/accounts/active  → switch active account {uuid}
        // DELETE /api/accounts/{uuid}→ remove account
        // DELETE /api/account        → remove active account

        app.get("/api/accounts", ctx -> {
            AccountService svc = AccountService.getInstance();
            ctx.json(svc != null ? svc.getAccountsPublic() : new java.util.ArrayList<>());
        });

        app.get("/api/account", ctx -> {
            AccountService svc = AccountService.getInstance();
            AccountService.StoredAccount acc = svc != null ? svc.getActiveAccount() : null;
            if (acc != null) ctx.json(acc.toPublic());
            else ctx.status(404).result("No active account");
        });

        app.post("/api/accounts/active", ctx -> {
            try {
                String uuid = gson.fromJson(ctx.body(), java.util.Map.class).get("uuid").toString();
                AccountService svc = AccountService.getInstance();
                if (svc != null && svc.setActiveAccount(uuid)) {
                    logService.info("Launcher", "Active account switched to " + uuid);
                    ctx.json(svc.getActiveAccount().toPublic());
                } else {
                    ctx.status(404).result("Account not found");
                }
            } catch (Exception e) {
                ctx.status(500).result(e.getMessage());
            }
        });

        app.delete("/api/accounts/{uuid}", ctx -> {
            try {
                AccountService svc = AccountService.getInstance();
                String uuid = ctx.pathParam("uuid");
                if (svc != null && svc.removeAccount(uuid)) {
                    logService.info("Launcher", "Account removed: " + uuid);
                    ctx.status(204);
                } else {
                    ctx.status(404).result("Account not found");
                }
            } catch (Exception e) {
                ctx.status(500).result(e.getMessage());
            }
        });

        app.delete("/api/account", ctx -> {
            try {
                AccountService svc = AccountService.getInstance();
                AccountService.StoredAccount acc = svc != null ? svc.getActiveAccount() : null;
                if (acc != null) {
                    svc.removeAccount(acc.uuid);
                    logService.info("Launcher", "Active account logged out");
                }
                ctx.status(204);
            } catch (Exception e) {
                ctx.status(500).result(e.getMessage());
            }
        });

        // ── Microsoft Auth (device-code flow) ─────────────────────────────────
        app.post("/api/auth/microsoft/start", ctx -> {
            try {
                java.util.Map<String,Object> info = MicrosoftAuthService.getInstance().start();
                logService.info("Launcher", "Microsoft login started — awaiting device code");
                ctx.json(info);
            } catch (Exception e) {
                logService.error("Launcher", null, "MS auth start error: " + e.getMessage());
                ctx.status(500).result(e.getMessage());
            }
        });

        app.get("/api/auth/microsoft/poll", ctx -> {
            java.util.Map<String,Object> result = MicrosoftAuthService.getInstance().poll();
            // On success, also return the accounts list so the frontend can refresh
            if (Boolean.TRUE.equals(result.get("done")) && result.containsKey("account")) {
                AccountService svc = AccountService.getInstance();
                if (svc != null) result.put("accounts", svc.getAccountsPublic());
            }
            ctx.json(result);
        });

        // ── Java auto-install ─────────────────────────────────────────────────
        app.post("/api/java/install", ctx -> {
            String versionParam = ctx.queryParam("version");
            int version = 17;
            try { if (versionParam != null) version = Integer.parseInt(versionParam); }
            catch (NumberFormatException ignored) {}

            final int featureVersion = version;
            ctx.result("Install started");   // respond immediately
            ctx.status(202);

            Executors.newSingleThreadExecutor().submit(() -> {
                try {
                    logService.info("Launcher", "Installing Java " + featureVersion + " via Adoptium…");
                    String javaPath = JavaInstaller.install(featureVersion, APP_DATA_DIR, (pct, msg) ->
                        logService.info("Launcher", "[Java Install] " + msg));
                    logService.info("Launcher", "Java " + featureVersion + " installed: " + javaPath);
                    broadcastEvent("java_installed", null,
                        gson.toJson(java.util.Map.of("version", featureVersion, "path", javaPath)));
                } catch (Exception e) {
                    logService.error("Launcher", null, "Java install failed: " + e.getMessage());
                    broadcastEvent("java_install_failed", null, e.getMessage());
                }
            });
        });

        // Synchronous install — used by frontend; returns path on completion
        app.post("/api/java/install/sync", ctx -> {
            String versionParam = ctx.queryParam("version");
            int featureVersion = 17;
            try { if (versionParam != null) featureVersion = Integer.parseInt(versionParam); }
            catch (NumberFormatException ignored) {}

            logService.info("Launcher",
                "Java " + featureVersion + " install requested (sync) — downloading from Eclipse Temurin…");
            try {
                final int fv = featureVersion;
                String javaPath = JavaInstaller.install(fv, APP_DATA_DIR, (pct, msg) -> {
                    logService.info("Launcher", "[Java " + fv + "] " + msg);
                    // Broadcast progress so the UI console shows it live
                    broadcastEvent("java_install_progress", null,
                        gson.toJson(java.util.Map.of("version", fv, "percent", pct, "message", msg)));
                });
                logService.info("Launcher", "Java " + fv + " installed: " + javaPath);
                ctx.json(java.util.Map.of("ok", true, "javaPath", javaPath, "version", fv));
            } catch (Exception e) {
                logService.error("Launcher", null, "Java install failed: " + e.getMessage());
                ctx.status(500).json(java.util.Map.of("ok", false, "error", e.getMessage()));
            }
        });

        app.get("/api/java/installed", ctx -> {
            ctx.json(JavaInstaller.getInstalled(APP_DATA_DIR));
        });

        // ── Versions ──────────────────────────────────────────────────────────
        app.get("/api/versions/game", ctx -> {
            CompletableFuture<List<String>> future = new CompletableFuture<>();
            versionManager.fetchGameVersions(new SimpleCallback<>(future));
            try { ctx.json(future.get(30, TimeUnit.SECONDS)); }
            catch (Exception e) { ctx.status(500).result(e.getMessage()); }
        });

        app.get("/api/versions/loader/{type}/{version}", ctx -> {
            String type     = ctx.pathParam("type");
            String mcVer    = ctx.pathParam("version");
            CompletableFuture<List<String>> future = new CompletableFuture<>();
            if ("fabric".equalsIgnoreCase(type)) {
                versionManager.fetchFabricLoaderVersions(mcVer, new SimpleCallback<>(future));
            } else if ("forge".equalsIgnoreCase(type)) {
                versionManager.fetchForgeVersions(mcVer, new SimpleCallback<>(future));
            } else if ("neoforge".equalsIgnoreCase(type)) {
                versionManager.fetchNeoForgeVersions(mcVer, new SimpleCallback<>(future));
            } else if ("quilt".equalsIgnoreCase(type)) {
                versionManager.fetchQuiltLoaderVersions(mcVer, new SimpleCallback<>(future));
            } else if ("liteloader".equalsIgnoreCase(type)) {
                versionManager.fetchLiteLoaderVersions(mcVer, new SimpleCallback<>(future));
            } else {
                ctx.json(Collections.emptyList()); return;
            }
            try { ctx.json(future.get(30, TimeUnit.SECONDS)); }
            catch (Exception e) { ctx.status(500).result(e.getMessage()); }
        });

        // ── CurseForge proxy (avoids CORS from renderer) ─────────────────────
        final String CF_API_KEY = loadBundledCfApiKey();
        app.get("/api/cf/search", ctx -> {
            String query   = ctx.queryParamAsClass("query",  String.class).getOrDefault("");
            String version = ctx.queryParamAsClass("version", String.class).getOrDefault("");
            String loader  = ctx.queryParamAsClass("loader",  String.class).getOrDefault("0");
            int    offset  = ctx.queryParamAsClass("offset",  Integer.class).getOrDefault(0);
            int    limit   = ctx.queryParamAsClass("limit",   Integer.class).getOrDefault(20);

            String urlStr = "https://api.curseforge.com/v1/mods/search"
                + "?gameId=432&classId=6"
                + "&searchFilter=" + java.net.URLEncoder.encode(query, "UTF-8")
                + (version.isBlank() ? "" : "&gameVersion=" + java.net.URLEncoder.encode(version, "UTF-8"))
                + "&modLoaderType=" + loader
                + "&pageSize=" + limit
                + "&index=" + offset
                + "&sortField=2&sortOrder=desc";

            try {
                java.net.URL url = new java.net.URL(urlStr);
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("x-api-key", CF_API_KEY);
                conn.setRequestProperty("Accept", "application/json");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("User-Agent", "AtlasCraft/1.0.0 (Minecraft Launcher)");
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                int status = conn.getResponseCode();
                if (status == 200) {
                    try (java.io.InputStreamReader reader = new java.io.InputStreamReader(conn.getInputStream())) {
                        char[] buf = new char[65536];
                        StringBuilder sb = new StringBuilder();
                        int n;
                        while ((n = reader.read(buf)) != -1) sb.append(buf, 0, n);
                        ctx.contentType("application/json");
                        ctx.result(sb.toString());
                    }
                } else {
                    // Read error body for debugging
                    String errBody = "";
                    try (java.io.InputStream es = conn.getErrorStream()) {
                        if (es != null) {
                            try (java.io.InputStreamReader er = new java.io.InputStreamReader(es)) {
                                char[] buf2 = new char[4096];
                                StringBuilder sb2 = new StringBuilder();
                                int n2;
                                while ((n2 = er.read(buf2)) != -1) sb2.append(buf2, 0, n2);
                                errBody = sb2.toString();
                            }
                        }
                    } catch (Exception ignored) {}
                    ctx.status(status).result("CF API error " + status + ": " + errBody);
                }
            } catch (Exception e) {
                ctx.status(502).result("CF proxy error: " + e.getMessage());
            }
        });

        // ── options.txt template ──────────────────────────────────────────────
        final File optionsTemplate = new File(APP_DATA_DIR, "options-template.txt");

        app.get("/api/options-template", ctx -> {
            if (!optionsTemplate.exists()) { ctx.result(""); return; }
            ctx.contentType("text/plain");
            ctx.result(new String(java.nio.file.Files.readAllBytes(optionsTemplate.toPath()),
                java.nio.charset.StandardCharsets.UTF_8));
        });

        app.post("/api/options-template", ctx -> {
            String body = ctx.body();
            java.nio.file.Files.writeString(optionsTemplate.toPath(), body,
                java.nio.charset.StandardCharsets.UTF_8,
                java.nio.file.StandardOpenOption.CREATE,
                java.nio.file.StandardOpenOption.TRUNCATE_EXISTING);
            ctx.status(204);
        });

        app.post("/api/options-template/apply", ctx -> {
            if (!optionsTemplate.exists()) { ctx.json(Map.of("applied", 0, "errors", Collections.emptyList())); return; }
            String templateContent = new String(java.nio.file.Files.readAllBytes(optionsTemplate.toPath()),
                java.nio.charset.StandardCharsets.UTF_8);
            if (templateContent.isBlank()) { ctx.json(Map.of("applied", 0, "errors", Collections.emptyList())); return; }

            int applied = 0;
            List<String> errors = new ArrayList<>();
            for (Profile p : profileManager.getProfiles()) {
                try {
                    File gameDir = new File(p.getGameDir());
                    gameDir.mkdirs();
                    File optFile = new File(gameDir, "options.txt");
                    java.nio.file.Files.writeString(optFile.toPath(), templateContent,
                        java.nio.charset.StandardCharsets.UTF_8,
                        java.nio.file.StandardOpenOption.CREATE,
                        java.nio.file.StandardOpenOption.TRUNCATE_EXISTING);
                    applied++;
                } catch (Exception e) {
                    errors.add(p.getName() + ": " + e.getMessage());
                }
            }
            ctx.json(Map.of("applied", applied, "errors", errors));
        });

        app.post("/api/options-template/apply-one", ctx -> {
            String profileName = ctx.queryParam("profile");
            if (profileName == null || profileName.isBlank()) { ctx.status(400).result("profile param required"); return; }
            if (!optionsTemplate.exists()) { ctx.json(Map.of("applied", false)); return; }
            String templateContent = new String(java.nio.file.Files.readAllBytes(optionsTemplate.toPath()),
                java.nio.charset.StandardCharsets.UTF_8);
            if (templateContent.isBlank()) { ctx.json(Map.of("applied", false)); return; }
            Profile p = profileManager.getProfile(profileName);
            if (p == null) { ctx.status(404).result("Profile not found"); return; }
            try {
                File gameDir = new File(p.getGameDir());
                gameDir.mkdirs();
                File optFile = new File(gameDir, "options.txt");
                java.nio.file.Files.writeString(optFile.toPath(), templateContent,
                    java.nio.charset.StandardCharsets.UTF_8,
                    java.nio.file.StandardOpenOption.CREATE,
                    java.nio.file.StandardOpenOption.TRUNCATE_EXISTING);
                ctx.json(Map.of("applied", true));
            } catch (Exception e) {
                ctx.status(500).result(e.getMessage());
            }
        });
    }

    // ── Async helpers ─────────────────────────────────────────────────────────

    private static void installProfileAsync(String name) {
        Profile p = profileManager.getProfile(name);
        if (p == null) return;
        if (installingProfiles.contains(name)) return;
        installingProfiles.add(name);
        broadcastStatus(name, "installing");
        Executors.newSingleThreadExecutor().submit(() -> resolveAndExecute(p, false));
    }

    private static void launchProfileAsync(Profile p) {
        installingProfiles.add(p.getName());
        broadcastStatus(p.getName(), "installing");
        Executors.newSingleThreadExecutor().submit(() -> resolveAndExecute(p, true));
    }

    private static void resolveAndExecute(Profile p, boolean launch) {
        try {
            String versionId = buildVersionId(p);
            logService.info("Launcher", p.getName(), "Resolving version: " + versionId);

            versionManager.downloadVersion(versionId, new File(p.getGameDir()),
                new DownloadCallback<Version>() {
                    @Override public void done(Version v) {
                        if (!launch) {
                            installingProfiles.remove(p.getName());
                            broadcastStatus(p.getName(), "stopped");
                            logService.info("Launcher", p.getName(), "Install complete");
                            return;
                        }
                        broadcastStatus(p.getName(), "running");
                        logService.info("Launcher", p.getName(), "Starting game…");
                        try {
                            launcherEngine.launch(p, versionId, new org.to2mbn.jmccc.launch.ProcessListener() {
                                @Override public void onLog(String line) {
                                    broadcastEvent("log", p.getName(), line);
                                }
                                @Override public void onErrorLog(String line) {
                                    broadcastEvent("error", p.getName(), line);
                                }
                                @Override public void onExit(int code) {
                                    broadcastStatus(p.getName(), "stopped");
                                }
                            });
                        } catch (Exception e) {
                            broadcastStatus(p.getName(), "stopped");
                            logService.error("Launcher", p.getName(), "Launch failed: " + e.getMessage());
                        } finally {
                            // Remove AFTER launch() returns — this keeps the guard active
                            // during Java download (which happens inside launcherEngine.launch())
                            installingProfiles.remove(p.getName());
                        }
                    }
                    @Override public void failed(Throwable e) {
                        installingProfiles.remove(p.getName());
                        broadcastStatus(p.getName(), "stopped");
                        logService.error("Launcher", p.getName(), "Download failed: " + e.getMessage());
                    }
                    @Override public void cancelled() { installingProfiles.remove(p.getName()); }
                    @Override public void updateProgress(long done, long total) {}
                    @Override public void retry(Throwable e, int c, int m) {}
                });
        } catch (Exception e) {
            installingProfiles.remove(p.getName());
            logService.error("Backend", p.getName(), "resolveAndExecute error: " + e.getMessage());
            broadcastStatus(p.getName(), "stopped");
        }
    }

    // ── Broadcast helpers ─────────────────────────────────────────────────────

    /**
     * Status events (running/stopped/installing) — not routed through LogService.
     */
    public static void broadcastStatus(String profile, String state) {
        String json = gson.toJson(new StatusMessage(profile, state));
        wsClients.forEach(ctx -> {
            try { if (ctx.session.isOpen()) ctx.send(json); } catch (Exception ignored) {}
        });
    }

    /**
     * Generic event (mod_installed, etc.) — also not a log entry.
     */
    public static void broadcastEvent(String type, String profile, String payload) {
        String json = gson.toJson(new EventMessage(type, profile, payload));
        wsClients.forEach(ctx -> {
            try { if (ctx.session.isOpen()) ctx.send(json); } catch (Exception ignored) {}
        });
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    private static String buildVersionId(Profile p) {
        String loader  = p.getModLoader();
        String loaderV = p.getLoaderVersion();
        if ("fabric".equalsIgnoreCase(loader) && loaderV != null && !loaderV.isBlank())
            return "fabric-loader-" + loaderV + "-" + p.getVersion();
        if (("forge".equalsIgnoreCase(loader) || "neoforge".equalsIgnoreCase(loader))
                && loaderV != null && !loaderV.isBlank())
            return p.getVersion() + "-forge-" + loaderV;
        if ("quilt".equalsIgnoreCase(loader) && loaderV != null && !loaderV.isBlank())
            return "quilt-loader-" + loaderV + "-" + p.getVersion();
        if ("liteloader".equalsIgnoreCase(loader) && loaderV != null && !loaderV.isBlank())
            return p.getVersion() + "-LiteLoader" + p.getVersion();
        return p.getVersion();
    }

    private static String findUniqueName(String base) {
        String candidate = base;
        int counter = 1;
        while (profileManager.getProfile(candidate) != null) {
            candidate = base + "-" + counter++;
        }
        return candidate;
    }

    private static int clearCacheForAllProfiles() {
        int count = 0;
        for (Profile p : profileManager.getProfiles()) {
            File fabricCache = new File(p.getGameDir(), ".fabric/processedMods");
            if (fabricCache.exists()) count += deleteDirectory(fabricCache);
            File tmpDir = new File(p.getGameDir(), ".tmp");
            if (tmpDir.exists()) count += deleteDirectory(tmpDir);
        }
        return count;
    }

    private static int deleteDirectory(File dir) {
        if (!dir.exists()) return 0;
        int count = 0;
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (f.isDirectory()) count += deleteDirectory(f);
                else { if (f.delete()) count++; }
            }
        }
        dir.delete();
        return count;
    }

    private static String loadBundledCfApiKey() {
        try (java.io.InputStream is = HeadlessServer.class.getResourceAsStream("/cf.key")) {
            if (is != null) return new String(is.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8).trim();
        } catch (java.io.IOException ignored) {}
        return "";
    }

    private static String getSHA1(File file) {
        try (java.io.InputStream is = new java.io.FileInputStream(file)) {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-1");
            byte[] buf = new byte[8192]; int n;
            while ((n = is.read(buf)) != -1) md.update(buf, 0, n);
            byte[] hash = md.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) { return null; }
    }

    // ── Inner DTOs ────────────────────────────────────────────────────────────

    static class StatusMessage {
        final String type = "status";
        String profile;
        String payload;
        StatusMessage(String p, String s) { this.profile = p; this.payload = s; }
    }

    static class EventMessage {
        String type;
        String profile;
        String payload;
        EventMessage(String t, String p, String d) { this.type = t; this.profile = p; this.payload = d; }
    }

    static class ModDownloadRequest { String url; String fileName; }
    static class ImportModRequest { String sourcePath; }

    static class ModFile {
        String fileName; String sha1; long size; boolean enabled;
        ModFile(String f, String s, long sz, boolean e) {
            this.fileName = f; this.sha1 = s; this.size = sz; this.enabled = e;
        }
    }

    /** Generic DownloadCallback adapter that completes a CompletableFuture. */
    static class SimpleCallback<T> implements DownloadCallback<T> {
        private final CompletableFuture<T> future;
        SimpleCallback(CompletableFuture<T> f) { this.future = f; }
        @Override public void done(T r)          { future.complete(r); }
        @Override public void failed(Throwable t){ future.completeExceptionally(t); }
        @Override public void cancelled()        {}
        @Override public void updateProgress(long d, long t) {}
        @Override public void retry(Throwable e, int c, int m) {}
    }
}

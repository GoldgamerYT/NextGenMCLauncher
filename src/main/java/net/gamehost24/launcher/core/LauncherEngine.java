package net.gamehost24.launcher.core;

import net.gamehost24.launcher.model.LauncherConfig;
import net.gamehost24.launcher.model.Profile;
import org.to2mbn.jmccc.launch.Launcher;
import org.to2mbn.jmccc.launch.LauncherBuilder;
import org.to2mbn.jmccc.launch.ProcessListener;
import org.to2mbn.jmccc.option.JavaEnvironment;
import org.to2mbn.jmccc.option.LaunchOption;
import org.to2mbn.jmccc.option.MinecraftDirectory;
import org.to2mbn.jmccc.option.WindowSize;
import org.to2mbn.jmccc.auth.Authenticator;
import org.to2mbn.jmccc.auth.OfflineAuthenticator;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Method;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

public class LauncherEngine {

    private final Map<String, Process> runningProcesses = new ConcurrentHashMap<>();
    private final Set<String> intentionallyStopped = ConcurrentHashMap.newKeySet();
    private final Launcher launcher;
    private LauncherConfig config;

    public LauncherEngine() {
        this.launcher = LauncherBuilder.create().build();
    }

    /** Inject global config (RAM defaults, JVM args, window, …). */
    public void setConfig(LauncherConfig config) {
        this.config = config;
    }

    // ── Launch overloads ──────────────────────────────────────────────────────

    /** Legacy 2-arg overload kept for backward-compat with JSBridge / MainFrame. */
    public void launch(Profile profile, String versionId)
            throws IOException, org.to2mbn.jmccc.launch.LaunchException {
        launch(profile, versionId, new ProcessListener() {
            @Override public void onLog(String log)      { System.out.println("[MC] " + log); }
            @Override public void onErrorLog(String log) { System.err.println("[MC ERR] " + log); }
            @Override public void onExit(int code)       {
                runningProcesses.remove(profile.getName());
                System.out.println("[MC] Exited with code " + code);
            }
        });
    }

    public void launch(Profile profile, String versionId, ProcessListener listener)
            throws IOException, org.to2mbn.jmccc.launch.LaunchException {

        LogService log = LogService.getInstance();

        // Stop existing process for this profile
        stop(profile.getName());

        // Rotate old instance log before starting fresh
        if (log != null) log.rotateInstanceLog(profile.getName());

        // Game directory
        File gameDir = new File(profile.getGameDir());
        gameDir.mkdirs();
        MinecraftDirectory mcDir = new MinecraftDirectory(gameDir);

        // Authenticator — use real MS account if available, fall back to offline
        Authenticator authenticator;
        AccountService accountService = AccountService.getInstance();
        if (accountService != null && accountService.getActiveAccount() != null) {
            authenticator = accountService.getActiveAuthenticator();
            if (log != null) log.info("Launcher", profile.getName(),
                "Using account: " + accountService.getActiveAccount().username
                + " (" + accountService.getActiveAccount().type + ")");
        } else {
            // No account — block launch with a clear error
            String msg = "No active account. Please log in via Settings → Accounts before launching.";
            if (log != null) log.error("Launcher", profile.getName(), msg);
            throw new org.to2mbn.jmccc.launch.LaunchException(msg);
        }

        // Launch option
        LaunchOption option = new LaunchOption(versionId, authenticator, mcDir);

        // ── RAM ──────────────────────────────────────────────────────────────
        int minRam, maxRam;
        String ramSource;
        if (profile.isUseGlobalRam()) {
            minRam = config != null ? config.getMinRamMb() : 512;
            maxRam = config != null ? config.getDefaultRamMb() : 4096;
            ramSource = "global";
        } else {
            // Profile-specific values; fall back to global if unset (0)
            minRam = profile.getProfileMinRamMb() > 0
                    ? profile.getProfileMinRamMb()
                    : (config != null ? config.getMinRamMb() : 512);
            maxRam = profile.getRamMb() > 0
                    ? profile.getRamMb()
                    : (config != null ? config.getDefaultRamMb() : 4096);
            ramSource = "profile";
        }
        // Validate
        if (maxRam < 512) {
            String msg = "RAM max (" + maxRam + "MB) too low — minimum is 512MB.";
            if (log != null) log.error("Launcher", profile.getName(), msg);
            throw new org.to2mbn.jmccc.launch.LaunchException(msg);
        }
        if (minRam > maxRam) {
            String msg = "Invalid RAM: Xms=" + minRam + "MB > Xmx=" + maxRam + "MB — fix RAM settings.";
            if (log != null) log.error("Launcher", profile.getName(), msg);
            throw new org.to2mbn.jmccc.launch.LaunchException(msg);
        }
        option.setMaxMemory(maxRam);

        // ── Extra JVM args (via reflection — API may vary by jmccc version) ──
        // -Xms is set here; -Xmx is already handled by option.setMaxMemory above.
        // Custom JVM args are included but -Xmx/-Xms are stripped to prevent
        // conflicts — RAM is always controlled via RAM Settings, never via JVM Args.
        List<String> extraJvm = new ArrayList<>();
        extraJvm.add("-Xms" + minRam + "m");
        if (config != null && !config.getJvmArgs().isBlank()) {
            int stripped = 0;
            for (String arg : config.getJvmArgs().split("\\s+")) {
                if (arg.isBlank()) continue;
                if (arg.startsWith("-Xmx") || arg.startsWith("-Xms")) {
                    stripped++;
                    if (log != null) log.warn("Launcher", profile.getName(),
                        "Stripped conflicting JVM arg '" + arg + "' — use RAM Settings instead of JVM Args.");
                } else {
                    extraJvm.add(arg);
                }
            }
            if (stripped > 0 && log != null)
                log.warn("Launcher", profile.getName(),
                    stripped + " JVM arg(s) stripped. Remove -Xmx/-Xms from custom JVM Args.");
        }
        trySetExtraJvmArgs(option, extraJvm, log, profile.getName());

        if (log != null) log.info("Launcher", profile.getName(),
            "RAM config — source=" + ramSource + "  Xms=" + minRam + "MB  Xmx=" + maxRam + "MB");

        // ── Window size ───────────────────────────────────────────────────────
        if (config != null) {
            try {
                option.setWindowSize(new WindowSize(config.getWindowWidth(), config.getWindowHeight()));
            } catch (Exception e) {
                if (log != null) log.warn("Launcher", profile.getName(),
                    "Could not set window size: " + e.getMessage());
            }
        }

        // ── Java executable ───────────────────────────────────────────────────
        File javaExec = resolveJava(profile, versionId, log);
        if (javaExec != null) option.setJavaEnvironment(new JavaEnvironment(javaExec));

        if (log != null) log.info("Launcher", profile.getName(),
            "Launching — version=" + versionId
            + (javaExec != null ? " java=" + javaExec : " (system java)"));

        // ── Wrap listener ─────────────────────────────────────────────────────
        final boolean[] inCrashReport = { false };
        ProcessListener wrapped = new ProcessListener() {
            @Override public void onLog(String line) {
                listener.onLog(line);
                if (log != null) log.info("Minecraft", profile.getName(), line);
            }
            @Override public void onErrorLog(String line) {
                listener.onErrorLog(line);
                if (log != null) {
                    // Detect the official Minecraft crash report header; capture everything after it
                    if (line.contains("---- Minecraft Crash Report ----")) {
                        inCrashReport[0] = true;
                    }
                    if (inCrashReport[0]) {
                        log.error("Minecraft", profile.getName(), line);
                        writeCrashLog(profile.getName(), line, log);
                    } else {
                        log.warn("Minecraft", profile.getName(), line);
                    }
                }
            }
            @Override public void onExit(int code) {
                inCrashReport[0] = false;
                runningProcesses.remove(profile.getName());
                boolean wasIntentional = intentionallyStopped.remove(profile.getName());
                listener.onExit(code);
                if (log != null) {
                    if (code == 0 || wasIntentional)
                        log.info("Minecraft", profile.getName(), "Game closed");
                    else
                        log.error("Minecraft", profile.getName(), "Exited with code " + code);
                }
            }
        };

        Process p = this.launcher.launch(option, wrapped);
        runningProcesses.put(profile.getName(), p);
    }

    // ── Stop ──────────────────────────────────────────────────────────────────

    public void stop(String profileName) {
        Process p = runningProcesses.remove(profileName);
        if (p == null || !p.isAlive()) return;
        intentionallyStopped.add(profileName);
        p.destroy();
        try {
            if (!p.waitFor(3, TimeUnit.SECONDS)) p.destroyForcibly();
        } catch (InterruptedException e) {
            p.destroyForcibly();
            Thread.currentThread().interrupt();
        }
        LogService log = LogService.getInstance();
        if (log != null) log.info("Launcher", profileName, "Game stopped");
    }

    public boolean isRunning(String profileName) {
        Process p = runningProcesses.get(profileName);
        return p != null && p.isAlive();
    }

    public Set<String> getRunningProfiles() {
        Set<String> running = new HashSet<>();
        runningProcesses.forEach((name, p) -> { if (p.isAlive()) running.add(name); });
        return running;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private File resolveJava(Profile profile, String versionId, LogService log) {
        // 1. Profile-level override
        if (profile.getJavaPath() != null && !profile.getJavaPath().isBlank()
                && !"java".equalsIgnoreCase(profile.getJavaPath())) {
            File f = new File(profile.getJavaPath());
            if (f.exists()) return f;
            if (log != null) log.warn("Launcher", profile.getName(),
                "Profile java path not found: " + profile.getJavaPath());
        }
        // 2. Global config override
        if (config != null && !config.getDefaultJavaPath().isBlank()) {
            File f = new File(config.getDefaultJavaPath());
            if (f.exists()) return f;
            if (log != null) log.warn("Launcher", profile.getName(),
                "Config java path not found: " + config.getDefaultJavaPath());
        }
        // 3. Auto-detect: read javaVersion.majorVersion from the installed version JSON first
        try {
            JavaManager jm = new JavaManager();
            int ver = readJavaMajorFromJson(new File(profile.getGameDir()), versionId, 0);
            if (ver <= 0) ver = jm.getRecommendedJavaVersion(versionId);
            if (log != null) log.info("Launcher", profile.getName(),
                "Auto-selecting Java " + ver + " for " + versionId);
            return jm.getJavaPath(ver, log, profile.getName());
        } catch (Exception e) {
            if (log != null) log.warn("Launcher", profile.getName(),
                "Java auto-detect failed: " + e.getMessage() + " — using system java");
        }
        return null;
    }

    private int readJavaMajorFromJson(File gameDir, String versionId, int depth) {
        if (depth > 5 || versionId == null) return -1;
        try {
            java.io.File jsonFile = new java.io.File(
                new java.io.File(gameDir, "versions/" + versionId), versionId + ".json");
            if (!jsonFile.exists()) return -1;
            String content = new String(java.nio.file.Files.readAllBytes(jsonFile.toPath()));
            com.google.gson.JsonObject obj = com.google.gson.JsonParser.parseString(content).getAsJsonObject();
            if (obj.has("javaVersion")) {
                com.google.gson.JsonObject jv = obj.getAsJsonObject("javaVersion");
                if (jv.has("majorVersion")) return jv.get("majorVersion").getAsInt();
            }
            if (obj.has("inheritsFrom")) {
                return readJavaMajorFromJson(gameDir, obj.get("inheritsFrom").getAsString(), depth + 1);
            }
        } catch (Exception ignored) {}
        return -1;
    }

    /**
     * Attempts to call setExtraJvmArguments via reflection so the code compiles
     * against any jmccc version that may or may not expose the method.
     */
    @SuppressWarnings("unchecked")
    private void trySetExtraJvmArgs(LaunchOption option, List<String> args, LogService log, String profile) {
        try {
            Method m = option.getClass().getMethod("setExtraJvmArguments", List.class);
            m.invoke(option, args);
        } catch (NoSuchMethodException e) {
            // jmccc version doesn't have this method — -Xms and custom args not applied
            if (log != null && !args.isEmpty())
                log.warn("Launcher", profile, "Extra JVM args not supported by jmccc — skipped: " + args);
        } catch (Exception e) {
            if (log != null) log.warn("Launcher", profile, "setExtraJvmArguments failed: " + e.getMessage());
        }
    }

    private void writeCrashLog(String instanceId, String line, LogService log) {
        File crashLog = new File(log.getInstanceLogsDir(), instanceId + "/crash.log");
        try {
            crashLog.getParentFile().mkdirs();
            // Rotate to crash.log.old when file exceeds 1 MB
            if (crashLog.exists() && crashLog.length() > 1024 * 1024) {
                File old = new File(crashLog.getParent(), "crash.log.old");
                old.delete();
                crashLog.renameTo(old);
            }
            try (java.io.PrintWriter w = new java.io.PrintWriter(
                    new java.io.FileWriter(crashLog, true))) {
                w.println("[" + java.time.Instant.now() + "] " + line);
            }
        } catch (IOException ignored) {}
    }
}

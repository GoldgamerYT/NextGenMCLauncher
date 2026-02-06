package net.gamehost24.launcher.core;

import net.gamehost24.launcher.model.Profile;
import org.to2mbn.jmccc.launch.Launcher;
import org.to2mbn.jmccc.launch.LauncherBuilder;
import org.to2mbn.jmccc.launch.ProcessListener;
import org.to2mbn.jmccc.option.LaunchOption;
import org.to2mbn.jmccc.option.MinecraftDirectory;
import org.to2mbn.jmccc.option.JavaEnvironment;
import org.to2mbn.jmccc.auth.OfflineAuthenticator;

import java.io.File;
import java.io.IOException;

public class LauncherEngine {

    private final java.util.Map<String, Process> runningProcesses = new java.util.concurrent.ConcurrentHashMap<>();
    private Launcher launcher;

    public LauncherEngine() {
        this.launcher = LauncherBuilder.create().build();
    }

    public void launch(Profile profile) throws IOException, org.to2mbn.jmccc.launch.LaunchException {
        launch(profile, profile.getVersion());
    }

    public void launch(Profile profile, String versionId) throws IOException, org.to2mbn.jmccc.launch.LaunchException {
        // Default listener logs to System.out
        launch(profile, versionId, new ProcessListener() {
            @Override
            public void onLog(String log) {
                System.out.println("[MC] " + log);
            }

            @Override
            public void onErrorLog(String log) {
                System.err.println("[MC Error] " + log);
            }

            @Override
            public void onExit(int code) {
                System.out.println("Minecraft exited with code " + code);
                runningProcesses.remove(profile.getName());
            }
        });
    }

    public void launch(Profile profile, String versionId, ProcessListener listener)
            throws IOException, org.to2mbn.jmccc.launch.LaunchException {
        // Stop existing if running
        stop(profile.getName());

        // Use the profile's game directory, independent isolation
        File gameDir = new File(profile.getGameDir());
        MinecraftDirectory mcDir = new MinecraftDirectory(gameDir);

        // Use OfflineAuthenticator for now as requested
        LaunchOption option = new LaunchOption(versionId, OfflineAuthenticator.name("Player"), mcDir);
        option.setMaxMemory(profile.getRamMb());

        File javaExec = null;
        if (profile.getJavaPath() != null && !profile.getJavaPath().isEmpty()
                && !"java".equalsIgnoreCase(profile.getJavaPath())) {
            File javaFile = new File(profile.getJavaPath());
            if (javaFile.exists()) {
                javaExec = javaFile;
            } else {
                System.err.println("Warning: Custom Java path not found: " + profile.getJavaPath());
            }
        }

        if (javaExec == null) {
            try {
                JavaManager javaManager = new JavaManager();
                // Heuristic: If versionId contains "1.20" -> Java 17/21 etc.
                int ver = javaManager.getRecommendedJavaVersion(versionId);
                System.out.println("Auto-resolving Java for " + versionId + " -> Java " + ver);
                javaExec = javaManager.getJavaPath(ver);
            } catch (Exception e) {
                System.err.println("Failed to auto-provision Java: " + e.getMessage());
                e.printStackTrace();
            }
        }

        if (javaExec != null) {
            option.setJavaEnvironment(new JavaEnvironment(javaExec));
        } else {
            System.out.println("Using default system Java.");
        }

        System.out.println("Launching with option: " + option);

        // Wrap the listener to ensure we remove the process on exit, even with custom
        // listener
        ProcessListener wrappedListener = new ProcessListener() {
            @Override
            public void onLog(String log) {
                listener.onLog(log);
            }

            @Override
            public void onErrorLog(String log) {
                listener.onErrorLog(log);
            }

            @Override
            public void onExit(int code) {
                listener.onExit(code);
                runningProcesses.remove(profile.getName());
            }
        };

        Process p = this.launcher.launch(option, wrappedListener);
        runningProcesses.put(profile.getName(), p);
    }

    public void stop(String profileName) {
        Process p = runningProcesses.remove(profileName);
        if (p != null && p.isAlive()) {
            p.destroyForcibly();
            System.out.println("Force stopped profile: " + profileName);
        }
    }

    public boolean isRunning(String profileName) {
        Process p = runningProcesses.get(profileName);
        return p != null && p.isAlive();
    }
}

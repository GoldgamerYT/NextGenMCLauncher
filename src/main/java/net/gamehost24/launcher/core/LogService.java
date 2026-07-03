package net.gamehost24.launcher.core;

import com.google.gson.Gson;
import io.javalin.websocket.WsContext;
import net.gamehost24.launcher.model.LogEntry;

import java.io.*;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.*;

/**
 * Central logging service.
 *
 * Responsibilities:
 *  1. Keeps an in-memory ring-buffer of the last MAX_HISTORY entries.
 *  2. Writes entries to log files on disk (async, non-blocking caller).
 *  3. Broadcasts structured JSON to all connected WebSocket clients.
 *  4. Sends recent history to newly connected WS clients.
 *
 * Thread-safe.  Singleton initialised once by HeadlessServer.
 */
public class LogService {

    // ── Constants ─────────────────────────────────────────────────────────────

    private static final int MAX_GLOBAL_HISTORY  = 2000;
    private static final int MAX_INSTANCE_HISTORY = 500;
    private static final int HISTORY_SEND_ON_CONNECT = 500;
    /** Maximum log file size (bytes) before rotation. */
    private static final long MAX_LOG_FILE_BYTES = 10L * 1024 * 1024; // 10 MB

    // ── Singleton ─────────────────────────────────────────────────────────────

    private static volatile LogService instance;

    public static LogService getInstance() { return instance; }

    public static LogService init(File appDataDir, Set<WsContext> wsClients) {
        instance = new LogService(appDataDir, wsClients);
        return instance;
    }

    // ── State ─────────────────────────────────────────────────────────────────

    private final Set<WsContext> wsClients;
    private final Gson gson = new Gson();

    // Global ring buffer (all sources)
    private final ArrayDeque<LogEntry> globalHistory = new ArrayDeque<>(MAX_GLOBAL_HISTORY);
    // Per-instance ring buffers
    private final ConcurrentHashMap<String, ArrayDeque<LogEntry>> instanceHistories = new ConcurrentHashMap<>();

    // Disk I/O
    private final File logsDir;
    private final File instancesLogsDir;
    private PrintWriter launcherWriter;
    private final ConcurrentHashMap<String, PrintWriter> instanceWriters = new ConcurrentHashMap<>();

    // Single-threaded executor so file writes are ordered and non-blocking
    private final ExecutorService fileIo = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "LogService-FileIO");
        t.setDaemon(true);
        return t;
    });

    // ── Constructor ───────────────────────────────────────────────────────────

    private LogService(File appDataDir, Set<WsContext> wsClients) {
        this.wsClients = wsClients;

        this.logsDir          = new File(appDataDir, "logs");
        this.instancesLogsDir = new File(logsDir, "instances");
        logsDir.mkdirs();
        instancesLogsDir.mkdirs();

        launcherWriter = openWriter(new File(logsDir, "launcher.log"), true);
    }

    // ── Public logging API ────────────────────────────────────────────────────

    public void info(String source, String message) {
        log("INFO", source, null, message);
    }

    public void info(String source, String instanceId, String message) {
        log("INFO", source, instanceId, message);
    }

    public void warn(String source, String instanceId, String message) {
        log("WARN", source, instanceId, message);
    }

    public void error(String source, String instanceId, String message) {
        log("ERROR", source, instanceId, message);
    }

    public void debug(String source, String message) {
        log("DEBUG", source, null, message);
    }

    /**
     * Main logging method. Puts entry in memory, schedules disk write, broadcasts to WS.
     */
    public void log(String level, String source, String instanceId, String message) {
        if (message == null || message.isBlank()) return;

        LogEntry entry = new LogEntry(level, source, instanceId, message);

        // 1. Add to in-memory ring buffers (synchronized to stay thread-safe)
        synchronized (globalHistory) {
            if (globalHistory.size() >= MAX_GLOBAL_HISTORY) globalHistory.pollFirst();
            globalHistory.addLast(entry);
        }
        if (instanceId != null) {
            instanceHistories.compute(instanceId, (k, deque) -> {
                if (deque == null) deque = new ArrayDeque<>(MAX_INSTANCE_HISTORY);
                if (deque.size() >= MAX_INSTANCE_HISTORY) deque.pollFirst();
                deque.addLast(entry);
                return deque;
            });
        }

        // 2. Write to disk (fire-and-forget, no blocking)
        fileIo.submit(() -> writeEntry(entry));

        // 3. Broadcast to live WS clients
        broadcastEntry(entry);
    }

    // ── History retrieval ─────────────────────────────────────────────────────

    public List<LogEntry> getHistory() {
        synchronized (globalHistory) {
            return new ArrayList<>(globalHistory);
        }
    }

    public List<LogEntry> getHistory(int limit) {
        synchronized (globalHistory) {
            List<LogEntry> all = new ArrayList<>(globalHistory);
            int start = Math.max(0, all.size() - limit);
            return all.subList(start, all.size());
        }
    }

    public List<LogEntry> getInstanceHistory(String instanceId) {
        ArrayDeque<LogEntry> deque = instanceHistories.get(instanceId);
        if (deque == null) return Collections.emptyList();
        synchronized (deque) {
            return new ArrayList<>(deque);
        }
    }

    // ── WS history on connect ─────────────────────────────────────────────────

    /**
     * Called when a new WS client connects.
     * Sends last HISTORY_SEND_ON_CONNECT entries so the console shows previous logs.
     */
    public void sendHistoryToClient(WsContext ctx) {
        List<LogEntry> recent = getHistory(HISTORY_SEND_ON_CONNECT);
        for (LogEntry entry : recent) {
            try {
                if (ctx.session.isOpen()) ctx.send(gson.toJson(new WsMessage(entry)));
                else break;
            } catch (Exception e) {
                break; // client disconnected during replay
            }
        }
    }

    // ── Log rotation ──────────────────────────────────────────────────────────

    /**
     * Rotates latest.log for an instance (rename to date-stamped file, open fresh writer).
     * Call before starting a new Minecraft process.
     */
    public void rotateInstanceLog(String instanceId) {
        fileIo.submit(() -> {
            PrintWriter old = instanceWriters.remove(instanceId);
            if (old != null) { old.flush(); old.close(); }

            File latestLog = new File(instancesLogsDir, instanceId + "/latest.log");
            if (latestLog.exists() && latestLog.length() > 0) {
                String date = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss"));
                latestLog.renameTo(new File(latestLog.getParent(), date + ".log"));
            }
        });
    }

    // ── File path helpers ─────────────────────────────────────────────────────

    public File getLogsDir()            { return logsDir; }
    public File getInstanceLogsDir()    { return instancesLogsDir; }
    public File getLauncherLogFile()    { return new File(logsDir, "launcher.log"); }
    public File getInstanceLogFile(String id) {
        return new File(instancesLogsDir, id + "/latest.log");
    }

    // ── Shutdown ──────────────────────────────────────────────────────────────

    public void shutdown() {
        fileIo.shutdown();
        try { fileIo.awaitTermination(5, TimeUnit.SECONDS); } catch (InterruptedException ignored) {}
        if (launcherWriter != null) { launcherWriter.flush(); launcherWriter.close(); }
        instanceWriters.values().forEach(w -> { w.flush(); w.close(); });
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private void writeEntry(LogEntry entry) {
        String line = formatFileLine(entry);

        // Launcher log for non-instance entries
        if (entry.instanceId == null) {
            rotateLauncherLogIfNeeded();
            if (launcherWriter != null) {
                launcherWriter.println(line);
                launcherWriter.flush();
            }
        }

        // Instance log (always, even for non-instance for complete trace)
        if (entry.instanceId != null) {
            PrintWriter w = instanceWriters.computeIfAbsent(entry.instanceId, id -> {
                File dir = new File(instancesLogsDir, id);
                dir.mkdirs();
                return openWriter(new File(dir, "latest.log"), true);
            });
            if (w != null) {
                w.println(line);
                w.flush();
                rotateInstanceLogIfNeeded(entry.instanceId);
            }
        }
    }

    private void rotateLauncherLogIfNeeded() {
        File logFile = new File(logsDir, "launcher.log");
        if (logFile.length() < MAX_LOG_FILE_BYTES) return;
        if (launcherWriter != null) { launcherWriter.close(); }
        String date = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss"));
        logFile.renameTo(new File(logsDir, "launcher-" + date + ".log"));
        launcherWriter = openWriter(logFile, false);
    }

    private void rotateInstanceLogIfNeeded(String instanceId) {
        File logFile = new File(instancesLogsDir, instanceId + "/latest.log");
        if (logFile.length() < MAX_LOG_FILE_BYTES) return;
        PrintWriter old = instanceWriters.remove(instanceId);
        if (old != null) { old.close(); }
        String date = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss"));
        logFile.renameTo(new File(logFile.getParent(), date + ".log"));
    }

    private void broadcastEntry(LogEntry entry) {
        String json = gson.toJson(new WsMessage(entry));
        wsClients.forEach(ctx -> {
            try {
                if (ctx.session.isOpen()) ctx.send(json);
            } catch (Exception ignored) { /* dead client */ }
        });
    }

    private static String formatFileLine(LogEntry e) {
        return String.format("[%s] [%-5s] [%s] %s%s",
            e.timestamp, e.level, e.source,
            e.instanceId != null ? "[" + e.instanceId + "] " : "",
            e.message);
    }

    private static PrintWriter openWriter(File file, boolean append) {
        try {
            file.getParentFile().mkdirs();
            return new PrintWriter(new BufferedWriter(new FileWriter(file, append)), true);
        } catch (IOException e) {
            System.err.println("[LogService] Cannot open log file " + file + ": " + e.getMessage());
            return null;
        }
    }

    // ── WS message DTO (backward-compatible with existing frontend) ───────────

    static class WsMessage {
        String type;        // "log" | "error"  (used by ConsoleWindow/ConsolePage)
        String profile;     // instanceId, null for launcher logs
        String payload;     // message text
        String timestamp;   // ISO-8601
        String level;       // INFO | WARN | ERROR | DEBUG
        String source;      // Launcher | Minecraft | Backend

        WsMessage(LogEntry e) {
            this.type      = "ERROR".equals(e.level) ? "error" : "log";
            this.profile   = e.instanceId;
            this.payload   = e.message;
            this.timestamp = e.timestamp;
            this.level     = e.level;
            this.source    = e.source;
        }
    }
}

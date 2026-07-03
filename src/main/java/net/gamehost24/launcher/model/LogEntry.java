package net.gamehost24.launcher.model;

import java.time.Instant;
import java.time.format.DateTimeFormatter;

/**
 * A single structured log entry.
 * Kept as plain data; no business logic here.
 */
public class LogEntry {
    public final String timestamp;   // ISO-8601, e.g. "2026-06-19T18:22:10.120Z"
    public final String level;       // INFO | WARN | ERROR | DEBUG
    public final String source;      // "Launcher" | "Backend" | "Minecraft"
    public final String instanceId;  // profile name, null for non-instance logs
    public final String message;

    public LogEntry(String level, String source, String instanceId, String message) {
        this.timestamp  = DateTimeFormatter.ISO_INSTANT.format(Instant.now());
        this.level      = level;
        this.source     = source;
        this.instanceId = instanceId;
        this.message    = message != null ? message : "";
    }
}

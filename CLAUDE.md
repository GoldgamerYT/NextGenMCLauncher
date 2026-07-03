# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

Atlas Craft is a two-process Minecraft launcher:

1. **Backend** — Java (Gradle), Javalin HTTP/WS server on `localhost:35555`
2. **Frontend** — Electron 29 + React 18 + TypeScript + Vite + TailwindCSS

The Electron main process spawns the backend JAR on startup (`app.isPackaged`). In dev mode the backend is started separately. The two processes communicate over HTTP REST and WebSocket — there is no shared memory or IPC between Java and Node.

### Data flow

```
Minecraft process
  └─ stdout/stderr → LauncherEngine.ProcessListener
       └─ LogService.log()
            ├─ ring buffer (2000 global / 500 per-instance)
            ├─ disk: userData/logs/instances/{id}/latest.log
            └─ WebSocket broadcast → all WsContext clients
                  └─ ConsolePage / ConsoleWindow (React)

Electron renderer
  └─ HTTP GET/POST → HeadlessServer routes (axios)
  └─ WS ws://localhost:35555/api/ws → real-time logs + status
  └─ ipcRenderer.invoke() → Electron main (file dialogs, settings, window controls)
```

### Key files

| File | Role |
|------|------|
| `src/.../HeadlessServer.java` | Javalin app, all REST routes, WS hub |
| `src/.../core/LauncherEngine.java` | jmccc launch wrapper, Java selection, RAM |
| `src/.../core/JavaManager.java` | Adoptium JRE download + version detection |
| `src/.../core/AccountService.java` | AES-256-GCM encrypted multi-account store |
| `src/.../core/MicrosoftAuthService.java` | Device-code OAuth → Xbox → XSTS → Minecraft |
| `src/.../core/LogService.java` | Central log ring-buffer + WS broadcast |
| `electron-client/electron/main.js` | Electron main: backend spawn, IPC handlers, splash |
| `electron-client/src/App.tsx` | Sidebar nav (Library / Settings / About), AnimatePresence |
| `electron-client/src/api.ts` | `api` (HTTP/axios) + `launcherApi` (IPC bridge) |
| `electron-client/src/components/GlobalSettings.tsx` | Tabbed settings UI |
| `electron-client/src/components/ConsolePage.tsx` | Inline console (sidebar tab) |

## Build Commands

### Backend
```bash
# Build fat-JAR (all deps bundled)
./gradlew jar

# Run backend directly (dev)
java --add-opens java.base/java.lang=ALL-UNNAMED \
     --add-opens java.base/java.util=ALL-UNNAMED \
     --add-opens java.base/java.lang.reflect=ALL-UNNAMED \
     --add-opens java.base/java.net=ALL-UNNAMED \
     --add-opens java.base/java.nio=ALL-UNNAMED \
     --add-opens java.base/sun.nio.ch=ALL-UNNAMED \
     --add-opens java.base/java.util.concurrent=ALL-UNNAMED \
     -jar build/libs/MCLauncher-1.0-SNAPSHOT.jar
```

### Frontend (dev)
```bash
cd electron-client
npm install
npm run electron:dev   # starts Vite (5173) + Electron together
```

### Full native installer (Windows)
```powershell
# Downloads JRE once, builds JAR, builds NSIS installer
.\build-installer.ps1
# Output: electron-client/release/Atlas Craft-Setup-1.0.0.exe
```

## Settings Architecture

Two separate setting stores exist and must not be confused:

| Store | Transport | File | Fields |
|-------|-----------|------|--------|
| **Launcher settings** | IPC (`get/save-launcher-settings`) | `userData/launcher-settings.json` | autostart, theme, animations, discordRpc, logLevel, consoleBounds |
| **API config** | HTTP (`GET/POST /api/config`) | `AppData/AtlasCraft/config.json` | defaultRamMb, minRamMb, gridScale, defaultJavaPath, jvmArgs, windowWidth/Height |

`GlobalSettings.tsx` loads both in one `Promise.all` and saves both on the Save button.

## Authentication

- No Microsoft auth is in the bundled jmccc JAR — `MicrosoftAuthService` does the full device-code OAuth chain in-process.
- On success, `AccountService` stores tokens encrypted with AES-256-GCM; key at `AppData/AtlasCraft/security/accounts.key`.
- `LauncherEngine` calls `AccountService.getActiveAuthenticator()` which returns a jmccc `Authenticator`. Launch is blocked if no active account.

## Java Version Selection

`JavaManager.getRecommendedJavaVersion(versionId)` resolves the required JRE:
- Standard `1.x.y` pattern → maps minor version to 8/17/21
- New Minecraft versioning (e.g. `fabric-loader-0.19.3-26.2`) → extracts trailing `major.minor`, major ≥ 21 → Java 21
- Unknown format → defaults to Java 21

JREs are downloaded from Adoptium and cached at `AppData/AtlasCraft/runtimes/java-{version}/`.

## API Endpoints (HeadlessServer)

```
GET  /api/health
GET  /api/config                        POST /api/config
GET  /api/profiles                      POST /api/profiles
GET  /api/profiles/{name}               PUT  /api/profiles/{name}     DELETE /api/profiles/{name}
POST /api/profiles/{name}/duplicate
POST /api/launch/{name}
GET  /api/versions/game
GET  /api/versions/loader/{type}/{mc}
GET  /api/logs/history?limit=N
GET  /api/logs/instance/{name}
GET  /api/accounts                      POST /api/accounts/active      DELETE /api/accounts/{uuid}
POST /api/auth/microsoft/start          GET  /api/auth/microsoft/poll
POST /api/java/install/sync?version=N   GET  /api/java/installed
GET  /api/java/check?path=...
GET  /api/system/memory
WS   ws://localhost:35555/api/ws
```

## IPC Channels (main.js ↔ renderer)

`ipcMain.handle` (invoke): `get/save-launcher-settings`, `select-image/directory/java/log-save`, `open-devtools/log-file/logs-dir/crash-reports/path`, `get-log-path/logs-dir/userdata-path`, `save-log-to-file`, `open-console-window`

`ipcMain.on` (fire-and-forget): `window-minimize/maximize/close`, `minecraft-running`, `minecraft-stopped`, `discord-rpc-activity`

## Frontend Design Tokens

- Background: `#09090b` / `bg-zinc-900`
- Borders: `border-white/5` or `border-white/10`
- Cards: `bg-zinc-900/40 border border-white/5 rounded-2xl p-6 backdrop-blur-sm`
- Accent: `green-500` / `text-green-400`
- Primary button: white bg + black text; Secondary: `bg-zinc-800`
- Font: Inter (sans), monospace for console/code

## WebSocket Message Format

```json
{ "type": "log"|"error"|"status", "profile": "instanceName|null", "payload": "..." }
```
`type=status` payloads: `"installing"`, `"running"`, `"stopped"`.  
`profile=null` means a launcher-level (not game-instance) message.

## Known Constraints

- jmccc `setExtraJvmArguments` is called via reflection — the method may not exist in all library versions; failure is soft-logged.
- `--add-opens` flags are required at JVM startup for the backend JAR (jmccc internals use reflection). They are passed by `start.bat`, `build-installer.ps1`, and `main.js`.
- Cross-platform installer builds require running on the target OS (electron-builder limitation for macOS/Linux).

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require('electron');
const path   = require('path');
const { spawn } = require('child_process');
const fs     = require('fs');
const http   = require('http');

// ─── AUTO UPDATER ─────────────────────────────────────────────────────────────
// Only active in packaged builds — dev mode skips all update checks.
let autoUpdater = null;
if (app.isPackaged) {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.autoDownload    = false; // we control when download starts
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger          = null;  // suppress file logging (we handle it)
  } catch (e) {
    console.error('[Updater] Failed to load electron-updater:', e.message);
  }
}

function sendUpdateStatus(status, extra = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status, ...extra });
  }
}

function setupAutoUpdater() {
  if (!autoUpdater) return;
  autoUpdater.on('checking-for-update',  () => sendUpdateStatus('checking'));
  autoUpdater.on('update-not-available', () => sendUpdateStatus('not-available'));
  autoUpdater.on('error',                (e) => {
    sendUpdateStatus('error', { message: e.message });
    appendLauncherLog('warn', `[Updater] Error: ${e.message}`);
  });
  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus('available', { version: info.version, releaseNotes: info.releaseNotes });
    appendLauncherLog('info', `[Updater] Update available: ${info.version}`);
  });
  autoUpdater.on('download-progress', (p) => {
    sendUpdateStatus('downloading', { percent: Math.round(p.percent), bytesPerSecond: p.bytesPerSecond });
  });
  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus('downloaded', { version: info.version });
    appendLauncherLog('info', `[Updater] Update downloaded: ${info.version}`);
  });
}

// ─── SINGLE INSTANCE LOCK ────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus the main window if a second instance is launched
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ─── DISCORD RPC ─────────────────────────────────────────────────────────────
// Client ID from https://discord.com/developers/applications
// Create an app at https://discord.com/developers/applications, enable "Rich Presence",
// add https://localhost as a redirect URI, then paste your Client ID here.
const DISCORD_CLIENT_ID = '1274012345678901234'; // Replace with your Discord App Client ID
let currentMCProfile = null; // track which profile is playing

let rpcClient = null;
let rpcEnabled = false;
let rpcStartTime = null;

function initDiscordRpc(enabled) {
  if (!enabled) {
    destroyDiscordRpc();
    return;
  }
  if (rpcClient) return; // already running
  try {
    const DiscordRPC = require('discord-rpc');
    DiscordRPC.register(DISCORD_CLIENT_ID);
    rpcClient = new DiscordRPC.Client({ transport: 'ipc' });
    rpcStartTime = Date.now();

    rpcClient.on('ready', () => {
      appendLauncherLog('info', '[Discord RPC] Connected');
      setDiscordActivity({ state: 'In Launcher', details: 'Atlas Craft' });
    });

    rpcClient.login({ clientId: DISCORD_CLIENT_ID }).catch(e => {
      appendLauncherLog('warn', `[Discord RPC] Could not connect: ${e.message}`);
      rpcClient = null;
    });
  } catch (e) {
    appendLauncherLog('warn', `[Discord RPC] Init error: ${e.message}`);
    rpcClient = null;
  }
}

function destroyDiscordRpc() {
  if (!rpcClient) return;
  try { rpcClient.destroy(); } catch (_) {}
  rpcClient = null;
  appendLauncherLog('info', '[Discord RPC] Disconnected');
}

function setDiscordActivity(activity) {
  if (!rpcClient) return;
  const playing = activity.playing === true;
  try {
    rpcClient.setActivity({
      details:        activity.details || 'Atlas Craft',
      state:          activity.state   || 'Idle',
      startTimestamp: playing ? Date.now() : rpcStartTime,
      largeImageKey:  playing ? 'minecraft' : 'logo',
      largeImageText: playing ? `Minecraft ${activity.version || ''}`.trim() : 'Atlas Craft',
      smallImageKey:  playing ? 'logo' : undefined,
      smallImageText: playing ? 'Atlas Craft' : undefined,
      instance:       false,
    }).catch(e => appendLauncherLog('warn', `[Discord RPC] setActivity error: ${e.message}`));
  } catch (e) {
    appendLauncherLog('warn', `[Discord RPC] Activity error: ${e.message}`);
  }
}

// ─── SETTINGS STORE ──────────────────────────────────────────────────────────

const userDataPath  = app.getPath('userData');
const settingsPath  = path.join(userDataPath, 'launcher-settings.json');

const DEFAULT_SETTINGS = {
  autostart:             false,
  minimizeAfterLaunch:   false,
  sleepModeOnMinimize:   false,
  closeAfterLaunch:      false,
  language:              'en',
  theme:                 'dark',
  animations:            true,
  discordRpc:            false,
  autoSaveLogs:          true,
  autoDeleteLogsDays:    30,
  debugMode:             false,
  logLevel:              'info',
  defaultInstance:       '',
  // Console window state
  consoleBounds: { x: null, y: null, width: 900, height: 650 },
};

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath))
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) };
  } catch (e) { console.error('Failed to load settings:', e); }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(data) {
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
  } catch (e) { console.error('Failed to save settings:', e); }
}

// ─── LAUNCHER LOGGING ────────────────────────────────────────────────────────

const logsDir        = path.join(userDataPath, 'logs');
const launcherLogPath = path.join(logsDir, 'launcher.log');

function ensureLogsDir() { fs.mkdirSync(logsDir, { recursive: true }); }

function appendLauncherLog(level, message) {
  try {
    ensureLogsDir();
    const ts = new Date().toISOString();
    fs.appendFileSync(launcherLogPath, `[${ts}] [${level.toUpperCase()}] [Launcher] ${message}\n`);
  } catch (e) { /* ignore */ }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('launcher-log', { level, source: 'Launcher', message });
  }
}

// ─── BACKEND HEALTH CHECK ────────────────────────────────────────────────────

// TCP-based health check — more reliable than HTTP in packaged Electron builds.
// Resolves true when port 35555 accepts a connection, false on timeout.
function waitForBackend(maxMs = 25000) {
  const net = require('net');
  return new Promise((resolve) => {
    const deadline = Date.now() + maxMs;
    let resolved = false;
    const done = (v) => { if (!resolved) { resolved = true; resolve(v); } };

    // Absolute failsafe — can never hang indefinitely
    const hardTimer = setTimeout(() => done(false), maxMs + 2000);

    const check = () => {
      if (Date.now() >= deadline) { clearTimeout(hardTimer); done(false); return; }
      const sock = new net.Socket();
      const t = setTimeout(() => { sock.destroy(); }, 1000);
      sock.connect(35555, '127.0.0.1', () => {
        clearTimeout(t); clearTimeout(hardTimer);
        sock.destroy();
        done(true);
      });
      sock.on('error', () => {
        clearTimeout(t);
        if (Date.now() < deadline) setTimeout(check, 600);
        else { clearTimeout(hardTimer); done(false); }
      });
    };
    check();
  });
}

// ─── WINDOWS ─────────────────────────────────────────────────────────────────

let mainWindow    = null;
let consoleWindow = null;
let splashWindow  = null;
let backendProcess = null;
let tray          = null;
let isSleepMode   = false;

// Resolve the best icon path available
function resolveIconPath() {
  // In packaged builds, icon-512.png is copied to resources/icon-512.png
  if (app.isPackaged) {
    const packed = path.join(process.resourcesPath, 'icon-512.png');
    if (fs.existsSync(packed)) return packed;
    return path.join(__dirname, 'icon.png');
  }
  // Dev mode: use the source asset
  const devAsset = path.join(__dirname, '..', 'src', 'assets', 'icon-512.png');
  if (fs.existsSync(devAsset)) return devAsset;
  return path.join(__dirname, 'icon.png');
}

function createTray() {
  if (tray) return;
  const iconPath = resolveIconPath();
  let img;
  try {
    img = nativeImage.createFromPath(iconPath);
    if (img.isEmpty()) img = nativeImage.createEmpty();
    // On Windows resize to 16x16 for tray
    if (process.platform === 'win32' && !img.isEmpty()) img = img.resize({ width: 16, height: 16 });
  } catch (_) {
    img = nativeImage.createEmpty();
  }

  // On macOS, tray icons should be template images (monochrome, adapts to dark/light menu bar)
  if (process.platform === 'darwin' && !img.isEmpty()) img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip('Atlas Craft');
  updateTrayMenu();

  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.webContents.setBackgroundThrottling(false);
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const sleepLabel = isSleepMode ? 'Atlas Craft (Sleep Mode — Minecraft running)' : 'Atlas Craft';
  const menu = Menu.buildFromTemplate([
    { label: sleepLabel, enabled: false },
    { type: 'separator' },
    {
      label: mainWindow && mainWindow.isVisible() ? 'Minimize' : 'Open',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.webContents.setBackgroundThrottling(false);
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

// Kill any process already listening on port 35555 (stale backend from previous session)
function killOldBackend() {
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano', { encoding: 'utf8', timeout: 4000 });
      const pids = new Set();
      for (const line of out.split('\n')) {
        const parts = line.trim().split(/\s+/);
        // parts: [TCP, localAddr:port, remoteAddr:port, state, PID]
        if (parts[0] !== 'TCP') continue;
        if (!parts[1] || !parts[1].endsWith(':35555')) continue;
        const pid = parts[parts.length - 1];
        if (/^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { timeout: 3000 });
          appendLauncherLog('info', `Killed stale backend process (PID ${pid})`);
        } catch (_) {}
      }
    } else {
      try {
        execSync('fuser -k 35555/tcp', { timeout: 3000, stdio: 'ignore' });
        appendLauncherLog('info', 'Killed stale backend on port 35555');
      } catch (_) {}
    }
  } catch (_) {}
}

const JVM_FLAGS = [
  '--add-opens', 'java.base/java.lang=ALL-UNNAMED',
  '--add-opens', 'java.base/java.util=ALL-UNNAMED',
  '--add-opens', 'java.base/java.lang.reflect=ALL-UNNAMED',
  '--add-opens', 'java.base/java.net=ALL-UNNAMED',
  '--add-opens', 'java.base/java.nio=ALL-UNNAMED',
  '--add-opens', 'java.base/sun.nio.ch=ALL-UNNAMED',
  '--add-opens', 'java.base/java.util.concurrent=ALL-UNNAMED',
];

function resolveBundledJava() {
  const javaExe = process.platform === 'win32' ? 'java.exe' : 'java';
  const jreRoot  = path.join(process.resourcesPath, 'jre');

  // Direct layout: resources/jre/bin/java
  const direct = path.join(jreRoot, 'bin', javaExe);
  if (fs.existsSync(direct)) return direct;

  // Nested layout: resources/jre/jdk-21.0.x+N-jre/bin/java  (Adoptium zip structure)
  if (fs.existsSync(jreRoot)) {
    const entries = fs.readdirSync(jreRoot).filter(e =>
      fs.statSync(path.join(jreRoot, e)).isDirectory()
    );
    for (const entry of entries) {
      const nested = path.join(jreRoot, entry, 'bin', javaExe);
      if (fs.existsSync(nested)) return nested;
    }
  }

  // Fallback: system Java (must be on PATH)
  return process.platform === 'win32' ? 'java.exe' : 'java';
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width:       340,
    height:      210,
    frame:       false,
    resizable:   false,
    center:      true,
    skipTaskbar: false,
    alwaysOnTop: true,
    icon:        resolveIconPath(),
    backgroundColor: '#09090b',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.on('closed', () => { splashWindow = null; });
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

function createWindow() {
  if (app.isPackaged) createSplashWindow();

  mainWindow = new BrowserWindow({
    width:       1200,
    height:      800,
    minWidth:    1000,
    minHeight:   650,
    resizable:   false,
    maximizable: false,
    show:        false, // revealed on ready-to-show
    icon: resolveIconPath(),
    frame: false,
    titleTransparent: true,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#09090b',
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    closeSplash();
  });

  if (app.isPackaged) {
    const backendPath = path.join(process.resourcesPath, 'backend.jar');
    const javaCmd     = resolveBundledJava();

    // Working directory for the backend process — same as where it stores config.json
    const backendCwd = process.platform === 'win32'
      ? path.join(process.env.APPDATA || app.getPath('userData'), 'AtlasCraft')
      : path.join(app.getPath('home'), '.atlascraft');
    fs.mkdirSync(backendCwd, { recursive: true });

    appendLauncherLog('info', `Java:    ${javaCmd}`);
    appendLauncherLog('info', `JAR:     ${backendPath}`);
    appendLauncherLog('info', `cwd:     ${backendCwd}`);
    appendLauncherLog('info', `JAR exists: ${fs.existsSync(backendPath)}`);
    appendLauncherLog('info', `Resources: ${process.resourcesPath}`);

    // Pre-flight: backend.jar must be present
    if (!fs.existsSync(backendPath)) {
      closeSplash();
      dialog.showErrorBox(
        'Atlas Craft — Missing Backend',
        `backend.jar was not found at:\n${backendPath}\n\nPlease reinstall Atlas Craft.`
      );
      app.quit();
      return;
    }

    let uiLoaded    = false;
    let errorShown  = false;

    const loadUI = () => {
      if (uiLoaded) return;
      uiLoaded = true;
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    };

    const showFatalError = (title, body) => {
      if (errorShown) return;
      errorShown = true;
      closeSplash();
      dialog.showErrorBox(title, body);
      app.quit();
    };

    // Kill any stale backend from a previous session before spawning a fresh one
    killOldBackend();

    backendProcess = spawn(javaCmd, [...JVM_FLAGS, '-jar', backendPath], {
      detached: false,
      cwd: backendCwd,
    });

    backendProcess.on('error', (err) => {
      appendLauncherLog('error', `Backend spawn failed: ${err.message}`);
      if (err.code === 'ENOENT') {
        showFatalError(
          'Atlas Craft — Java Not Found',
          `Could not launch Java:\n  ${javaCmd}\n\nThe bundled JRE appears to be missing or corrupt.\n\nPlease reinstall Atlas Craft.\n\nLog: ${launcherLogPath}`
        );
      } else {
        showFatalError(
          'Atlas Craft — Backend Error',
          `Failed to start the backend process:\n${err.message}\n\nLog: ${launcherLogPath}`
        );
      }
    });

    backendProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) appendLauncherLog('info', `[Backend] ${msg}`);
    });

    backendProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) appendLauncherLog('warn', `[Backend] ${msg}`);
    });

    backendProcess.on('exit', (code) => {
      appendLauncherLog('warn', `Backend process exited with code ${code}`);
      if (code === 99) {
        showFatalError(
          'Atlas Craft — Port In Use',
          'Port 35555 is already occupied.\n\nAnother instance of Atlas Craft is likely running. Close it and try again.'
        );
        return;
      }
      if (code !== 0 && code !== null && !uiLoaded) {
        showFatalError(
          'Atlas Craft — Backend Crashed',
          `The backend process exited unexpectedly (code ${code}).\n\nCheck the log for details:\n${launcherLogPath}`
        );
        return;
      }
      loadUI();
    });

    waitForBackend(25000).then((ok) => {
      if (ok) {
        appendLauncherLog('info', 'Backend ready');
        loadUI();
      } else {
        appendLauncherLog('warn', 'Backend health-check timed out');
        if (!errorShown) {
          // Backend never became ready but didn't crash with a known code — show warning and load anyway
          closeSplash();
          const choice = dialog.showMessageBoxSync({
            type: 'warning',
            title: 'Atlas Craft — Backend Timeout',
            message: 'The backend is taking too long to start.',
            detail: `It may still be starting (antivirus scan, slow disk).\n\nLog: ${launcherLogPath}`,
            buttons: ['Wait & Continue', 'Quit'],
            defaultId: 0,
          });
          if (choice === 1) { app.quit(); return; }
        }
        loadUI();
      }
    });
  } else {
    appendLauncherLog('info', 'Dev mode — backend managed externally');
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

function openConsoleWindow() {
  if (consoleWindow && !consoleWindow.isDestroyed()) {
    consoleWindow.focus();
    return;
  }

  const settings = loadSettings();
  const bounds   = settings.consoleBounds || DEFAULT_SETTINGS.consoleBounds;

  consoleWindow = new BrowserWindow({
    width:  bounds.width  || 900,
    height: bounds.height || 650,
    x: bounds.x ?? undefined,
    y: bounds.y ?? undefined,
    minWidth:  600,
    minHeight: 400,
    icon: resolveIconPath(),
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#09090b',
    title: 'Atlas Craft — Console',
  });

  if (app.isPackaged) {
    consoleWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { consolepanel: 'true' },
    });
  } else {
    consoleWindow.loadURL('http://localhost:5173?consolepanel=true');
  }

  // Save window bounds on close
  consoleWindow.on('close', () => {
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      const b = consoleWindow.getBounds();
      const s = loadSettings();
      s.consoleBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
      saveSettings(s);
    }
  });

  consoleWindow.on('closed', () => { consoleWindow = null; });
}

// ─── APP LIFECYCLE ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  setupAutoUpdater();
  createWindow();
  createTray();

  // Apply autostart + discord RPC from saved settings
  const settings = loadSettings();
  app.setLoginItemSettings({ openAtLogin: settings.autostart === true });
  appendLauncherLog('info', 'Launcher started');
  rpcEnabled = settings.discordRpc === true;
  initDiscordRpc(rpcEnabled);

  // Check for updates 5s after start (give UI time to load)
  if (autoUpdater) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(e =>
        appendLauncherLog('warn', `[Updater] Auto-check failed: ${e.message}`)
      );
    }, 5000);
  }

  // ── File dialogs ──
  ipcMain.handle('select-image', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'png', 'gif', 'webp'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('select-directory', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('select-java', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Java Executable', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('select-log-save', async () => {
    const r = await dialog.showSaveDialog({
      defaultPath: `launcher-${Date.now()}.log`,
      filters: [{ name: 'Log File', extensions: ['log', 'txt'] }],
    });
    return r.canceled ? null : r.filePath;
  });

  // ── Settings ──
  ipcMain.handle('get-launcher-settings', () => loadSettings());

  ipcMain.handle('save-launcher-settings', (_, data) => {
    saveSettings(data);
    app.setLoginItemSettings({ openAtLogin: data.autostart === true });
    // Update Discord RPC if setting changed
    if (data.discordRpc !== rpcEnabled) {
      rpcEnabled = data.discordRpc === true;
      initDiscordRpc(rpcEnabled);
    }
    appendLauncherLog('info', 'Launcher settings saved');
    return true;
  });

  // ── Discord RPC IPC ──
  ipcMain.on('discord-rpc-activity', (_, activity) => {
    setDiscordActivity(activity);
  });

  // ── Get active Discord Client ID ──
  ipcMain.handle('get-discord-client-id', () => DISCORD_CLIENT_ID);

  // ── Console window ──
  ipcMain.handle('open-console-window', () => { openConsoleWindow(); });

  // ── Shell / Paths ──
  ipcMain.handle('open-path', async (_, filePath) => {
    if (filePath) await shell.openPath(filePath);
  });

  ipcMain.handle('open-external', async (_, url) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle('get-log-path',      () => launcherLogPath);
  ipcMain.handle('get-logs-dir',      () => logsDir);
  ipcMain.handle('get-userdata-path', () => userDataPath);

  ipcMain.handle('open-log-file', async () => {
    ensureLogsDir();
    if (!fs.existsSync(launcherLogPath)) fs.writeFileSync(launcherLogPath, '');
    await shell.openPath(launcherLogPath);
  });

  ipcMain.handle('open-logs-dir', async () => {
    ensureLogsDir();
    await shell.openPath(logsDir);
  });

  ipcMain.handle('open-crash-reports', async () => {
    const dir = path.join(userDataPath, 'logs', 'instances');
    fs.mkdirSync(dir, { recursive: true });
    await shell.openPath(dir);
  });

  ipcMain.handle('save-log-to-file', async (_, { filePath, content }) => {
    try { fs.writeFileSync(filePath, content, 'utf-8'); return true; }
    catch (e) { return false; }
  });

  // ── DevTools ──
  ipcMain.handle('open-devtools', () => {
    if (mainWindow) mainWindow.webContents.openDevTools();
  });

  // ── Auto-updater IPC ──
  ipcMain.handle('check-for-updates', async () => {
    if (!autoUpdater) return { status: 'not-available' };
    try { await autoUpdater.checkForUpdates(); } catch (e) { return { error: e.message }; }
    return { ok: true };
  });
  ipcMain.handle('start-download', async () => {
    if (!autoUpdater) return;
    try { await autoUpdater.downloadUpdate(); } catch (e) {
      appendLauncherLog('warn', `[Updater] Download error: ${e.message}`);
    }
  });
  ipcMain.handle('install-update', () => {
    if (autoUpdater) autoUpdater.quitAndInstall(false, true);
  });

  // ── Minecraft running — minimize / sleep / close based on settings ──
  ipcMain.on('minecraft-running', (_, profileName) => {
    const settings = loadSettings();
    currentMCProfile = profileName || null;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (settings.closeAfterLaunch) {
      appendLauncherLog('info', 'Closing launcher after Minecraft start');
      mainWindow.close();
    } else if (settings.minimizeAfterLaunch) {
      if (settings.sleepModeOnMinimize) {
        appendLauncherLog('info', 'Sleep mode: hiding launcher to save resources');
        isSleepMode = true;
        mainWindow.webContents.setBackgroundThrottling(true);
        mainWindow.hide();
        if (process.platform === 'darwin' && app.dock) app.dock.hide();
        createTray();
        updateTrayMenu();
      } else {
        appendLauncherLog('info', 'Minimizing launcher after Minecraft start');
        mainWindow.minimize();
      }
    }
  });

  // ── Minecraft stopped — wake up from sleep mode if needed ──
  ipcMain.on('minecraft-stopped', () => {
    currentMCProfile = null;
    isSleepMode = false;
    updateTrayMenu();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isVisible()) {
      appendLauncherLog('info', 'Sleep mode: waking launcher (Minecraft stopped)');
      mainWindow.webContents.setBackgroundThrottling(false);
      if (process.platform === 'darwin' && app.dock) app.dock.show();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // ── Window Controls ──
  ipcMain.on('window-minimize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
  });
  ipcMain.on('window-maximize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) { if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
  });
  ipcMain.on('window-close', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Don't quit if we have a tray icon and sleep mode is active (MC still running)
  if (isSleepMode) return;
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isSleepMode = false; // ensure we quit properly
});

app.on('will-quit', () => {
  appendLauncherLog('info', 'Launcher shutting down — killing all child processes');
  destroyDiscordRpc();

  if (backendProcess && !backendProcess.killed) {
    const pid = backendProcess.pid;
    if (process.platform === 'win32') {
      // Kill entire process tree (Minecraft children included) — fire-and-forget, non-blocking
      require('child_process').spawn('taskkill', ['/F', '/T', '/PID', String(pid)], {
        detached: true, stdio: 'ignore',
      }).unref();
    } else {
      try { process.kill(-pid, 'SIGTERM'); } catch (_) {}
    }
    try { backendProcess.kill(); } catch (_) {}
  }
});

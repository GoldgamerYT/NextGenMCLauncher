const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings:       ()     => ipcRenderer.invoke('get-launcher-settings'),
  saveSettings:      (data) => ipcRenderer.invoke('save-launcher-settings', data),

  // Console window
  openConsoleWindow: () => ipcRenderer.invoke('open-console-window'),

  // DevTools / paths
  openDevTools:      ()    => ipcRenderer.invoke('open-devtools'),
  openPath:          (p)   => ipcRenderer.invoke('open-path', p),
  openLogFile:       ()    => ipcRenderer.invoke('open-log-file'),
  openLogsDir:       ()    => ipcRenderer.invoke('open-logs-dir'),
  openCrashReports:  ()    => ipcRenderer.invoke('open-crash-reports'),
  getLogPath:        ()    => ipcRenderer.invoke('get-log-path'),
  getLogsDir:        ()    => ipcRenderer.invoke('get-logs-dir'),
  getUserDataPath:   ()    => ipcRenderer.invoke('get-userdata-path'),

  // File pickers
  selectImage:     ()                  => ipcRenderer.invoke('select-image'),
  selectDirectory: ()                  => ipcRenderer.invoke('select-directory'),
  selectJava:      ()                  => ipcRenderer.invoke('select-java'),
  selectLogSave:   ()                  => ipcRenderer.invoke('select-log-save'),
  saveLogToFile:   (filePath, content) => ipcRenderer.invoke('save-log-to-file', { filePath, content }),

  // Window controls (fire-and-forget)
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  // Minecraft lifecycle signals
  notifyMinecraftRunning: (profileName) => ipcRenderer.send('minecraft-running', profileName),
  notifyMinecraftStopped: () => ipcRenderer.send('minecraft-stopped'),

  // Discord RPC
  setDiscordActivity: (activity) => ipcRenderer.send('discord-rpc-activity', activity),

  // Open URLs in default browser (routed through main process shell)
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Launcher log events from main process
  onLauncherLog:  (cb) => ipcRenderer.on('launcher-log', (_event, data) => cb(data)),
  offLauncherLog: ()   => ipcRenderer.removeAllListeners('launcher-log'),

  // Auto-updater
  checkForUpdates:     ()   => ipcRenderer.invoke('check-for-updates'),
  startDownload:       ()   => ipcRenderer.invoke('start-download'),
  installUpdate:       ()   => ipcRenderer.invoke('install-update'),
  onUpdateStatus:      (cb) => ipcRenderer.on('update-status', (_event, data) => cb(data)),
  offUpdateStatus:     ()   => ipcRenderer.removeAllListeners('update-status'),
});

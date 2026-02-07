const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Auto-updater (only in production)
let autoUpdater = null;
if (app.isPackaged) {
  const { autoUpdater: updater } = require('electron-updater');
  autoUpdater = updater;
}

let mainWindow = null;
let backendProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    icon: path.join(__dirname, 'icon.png'),
    frame: false, // Custom Titlebar
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simple IPC in this prototype
    },
    backgroundColor: '#0f0f12', // Dark Atlas theme bg
    show: false, // Don't show until ready
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Launch Java Backend if in production
  if (app.isPackaged) {
    const backendPath = path.join(process.resourcesPath, 'backend.jar');
    console.log("Launching Backend from:", backendPath);

    // Find Java executable
    const javaPath = findJava();
    
    backendProcess = spawn(javaPath, [
      '-jar',
      backendPath,
      '--add-opens', 'java.base/java.lang=ALL-UNNAMED'
    ], {
      cwd: process.resourcesPath
    });

    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend] ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`[Backend Err] ${data}`);
    });

    backendProcess.on('close', (code) => {
      console.log(`Backend exited with code ${code}`);
    });

    // Wait for backend to start before loading UI
    setTimeout(() => {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }, 2000);
  } else {
    // Dev mode
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  }

  // Setup auto-updater
  if (autoUpdater) {
    setupAutoUpdater();
  }
}

function findJava() {
  // Try to find Java in common locations
  const isWin = process.platform === 'win32';
  const javaName = isWin ? 'java.exe' : 'java';
  
  // Check JAVA_HOME
  if (process.env.JAVA_HOME) {
    const javaPath = path.join(process.env.JAVA_HOME, 'bin', javaName);
    try {
      require('fs').accessSync(javaPath);
      return javaPath;
    } catch {}
  }
  
  // Fallback to PATH
  return 'java';
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    sendStatusToWindow('update-status', { 
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes
    });
    
    // Show dialog to user
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available. Would you like to download it now?`,
      buttons: ['Download', 'Later'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendStatusToWindow('update-status', { status: 'not-available' });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendStatusToWindow('update-status', {
      status: 'downloading',
      progress: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendStatusToWindow('update-status', { 
      status: 'downloaded',
      version: info.version 
    });
    
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded. Restart now to install?`,
      buttons: ['Restart Now', 'Later'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (error) => {
    sendStatusToWindow('update-status', { 
      status: 'error',
      error: error.message 
    });
  });

  // Check for updates on startup (after a delay)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.log('Update check failed:', err.message);
    });
  }, 5000);
}

function sendStatusToWindow(channel, data) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data);
  }
}

app.whenReady().then(() => {
  createWindow();

  // IPC: Handle Image Selection natively
  ipcMain.handle('select-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'png', 'gif', 'webp'] }]
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // IPC: Window Controls
  ipcMain.on('window-minimize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
  });

  ipcMain.on('window-maximize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
  });

  // IPC: Check for updates manually
  ipcMain.on('check-for-updates', () => {
    if (autoUpdater) {
      autoUpdater.checkForUpdates().catch(err => {
        sendStatusToWindow('update-status', { 
          status: 'error',
          error: err.message 
        });
      });
    }
  });

  // IPC: Get app version
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (backendProcess) {
    console.log('Stopping backend...');
    backendProcess.kill();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  dialog.showErrorBox('Error', `An unexpected error occurred:\n${error.message}`);
});

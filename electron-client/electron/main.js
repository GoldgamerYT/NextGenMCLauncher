const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let backendProcess = null;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'icon.png'),
    frame: false, // Custom Titlebar
    titleTransparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simple IPC in this prototype
    },
    backgroundColor: '#0f0f12' // Dark Atlas theme bg
  });

  // Launch Java Backend if in production
  if (app.isPackaged) {
    const backendPath = path.join(process.resourcesPath, 'backend.jar');
    console.log("Launching Backend from:", backendPath);

    // Attempt to launch backend
    backendProcess = spawn('java', ['-jar', backendPath]);

    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend] ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`[Backend Err] ${data}`);
    });

    // Load built frontend
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    // Dev mode
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();

  // IPC: Handle Image Selection natively
  const { ipcMain, dialog } = require('electron');
  ipcMain.handle('select-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'png', 'gif'] }]
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

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});

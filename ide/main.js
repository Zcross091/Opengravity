const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let agentdProcess = null;

function startAgentd() {
  const agentdPath = path.join(__dirname, 'daemon', 'dist', 'index.js');
  try {
    agentdProcess = spawn('node', [agentdPath, '--port', '38888'], {
      stdio: 'ignore',
      detached: false
    });
  } catch (err) {
    console.error('Failed to spawn agentd daemon:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'OpenGravity IDE',
    icon: path.join(__dirname, 'extension', 'media', 'logo.svg'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load OpenGravity web dashboard & workbench or local Monaco interface
  const clientIndex = path.join(__dirname, '..', 'client', 'dist', 'index.html');
  const fs = require('fs');
  if (fs.existsSync(clientIndex)) {
    mainWindow.loadFile(clientIndex);
  } else {
    mainWindow.loadURL('http://localhost:3001');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startAgentd();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (agentdProcess) {
    try {
      agentdProcess.kill();
    } catch {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

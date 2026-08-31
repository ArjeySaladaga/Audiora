const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.opus'
]);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: '#0e0e16',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- Helpers -------------------------------------------------------------

function isAudioFile(filePath) {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function trackFromPath(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  let title = base;
  let artist = 'Unknown Artist';

  const sepMatch = base.split(' - ');
  if (sepMatch.length >= 2) {
    artist = sepMatch[0].trim();
    title = sepMatch.slice(1).join(' - ').trim();
  }

  return {
    id: filePath,
    filePath,
    fileUrl: 'file://' + encodeURI(filePath.replace(/\\/g, '/')),
    title,
    artist
  };
}

async function scanFolder(folderPath, depth = 4) {
  let results = [];
  let entries;
  try {
    entries = await fs.readdir(folderPath, { withFileTypes: true });
  } catch (err) {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name);
    if (entry.isDirectory()) {
      if (depth > 0) {
        const nested = await scanFolder(fullPath, depth - 1);
        results = results.concat(nested);
      }
    } else if (entry.isFile() && isAudioFile(fullPath)) {
      results.push(trackFromPath(fullPath));
    }
  }
  return results;
}

// --- IPC handlers ----------------------------------------------------------

ipcMain.handle('dialog:openFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Add tracks to Audiora',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus'] }
    ]
  });

  if (result.canceled) return [];
  return result.filePaths.filter(isAudioFile).map(trackFromPath);
});

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Add a folder to Audiora',
    properties: ['openDirectory']
  });

  if (result.canceled) return [];
  const tracks = await scanFolder(result.filePaths[0]);
  return tracks;
});

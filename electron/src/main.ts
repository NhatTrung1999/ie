import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';
import { ServerManager } from './server-manager';
import { IpDetector } from './ip-detector';
import { NetworkWatcher } from './network-watcher';
import { SyncManager } from './sync-manager';

const isDev = !app.isPackaged;
const BACKEND_PORT = 3002; // Dùng port khác để tránh xung đột với server online

let mainWindow: BrowserWindow | null = null;
let serverManager: ServerManager;
let networkWatcher: NetworkWatcher;
let syncManager: SyncManager;

// Đăng ký custom protocol để serve frontend static files
function registerAppProtocol() {
  protocol.handle('app', (request) => {
    const url = request.url.replace('app://', '');
    const decodedUrl = decodeURIComponent(url);
    const frontendPath = path.join(__dirname, '../../frontend/dist');
    const filePath = path.join(frontendPath, decodedUrl);

    // Serve index.html cho mọi route không phải asset (SPA routing)
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return net.fetch(`file://${path.join(frontendPath, 'index.html')}`);
    }

    return net.fetch(`file://${filePath}`);
  });
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'IE Offline',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Cho phép load file:// URLs cho video
    },
    show: false,
  });

  // Loading screen trước khi NestJS ready
  mainWindow.webContents.loadURL(
    `data:text/html,<style>body{margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#94a3b8;font-size:18px}</style><body>Đang khởi động IE Offline...</body>`,
  );

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupIpcHandlers() {
  // === File Selection ===
  ipcMain.handle('dialog:selectVideo', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Chọn file video',
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:exportData', async () => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Xuất dữ liệu',
      defaultPath: `ie-data-${new Date().toISOString().slice(0, 10)}.iedata`,
      filters: [{ name: 'IE Data File', extensions: ['iedata'] }],
    });

    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('dialog:importData', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Nhập dữ liệu',
      filters: [{ name: 'IE Data File', extensions: ['iedata'] }],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('file:readData', async (_event, filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, data: content };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('file:writeData', async (_event, filePath: string, content: string) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('file:getVideoUrl', (_event, filePath: string) => {
    // Trả về file:// URL cho video player
    return `file://${filePath.replace(/\\/g, '/')}`;
  });

  // === Network & Sync ===
  ipcMain.handle('sync:getStatus', () => {
    return syncManager.getStatus();
  });

  ipcMain.handle('sync:trigger', async () => {
    return syncManager.runSync();
  });

  ipcMain.handle('network:isOnline', () => {
    return networkWatcher.isOnline();
  });

  // === Identity ===
  ipcMain.handle('identity:getIp', () => {
    return IpDetector.getLocalIp();
  });

  ipcMain.handle('identity:getHostname', () => {
    return IpDetector.getHostname();
  });
}

app.whenReady().then(async () => {
  registerAppProtocol();

  // Khởi tạo các services
  serverManager = new ServerManager(BACKEND_PORT);
  syncManager = new SyncManager(`http://127.0.0.1:${BACKEND_PORT}`);

  // Tạo cửa sổ trước (hiện loading screen)
  await createMainWindow();
  setupIpcHandlers();

  // Khởi động NestJS backend
  try {
    await serverManager.start();
    console.log(`[Main] NestJS backend started on port ${BACKEND_PORT}`);
  } catch (error) {
    console.error('[Main] Failed to start backend:', error);
    dialog.showErrorBox('Lỗi khởi động', `Không thể khởi động backend server: ${error}`);
    app.quit();
    return;
  }

  // Load frontend
  if (isDev) {
    await mainWindow?.loadURL('http://localhost:5173');
  } else {
    await mainWindow?.loadURL('app://./index.html');
  }

  // Khởi động network watcher và sync
  networkWatcher = new NetworkWatcher(
    () => {
      // Khi online
      console.log('[Main] Network online — triggering sync');
      mainWindow?.webContents.send('network:online');
      void syncManager.runSync().then(() => {
        mainWindow?.webContents.send('sync:completed', syncManager.getStatus());
      });
    },
    () => {
      // Khi offline
      console.log('[Main] Network offline');
      mainWindow?.webContents.send('network:offline');
    },
  );

  networkWatcher.start();
});

app.on('window-all-closed', async () => {
  networkWatcher?.stop();
  await serverManager?.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

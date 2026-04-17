"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const server_manager_1 = require("./server-manager");
const ip_detector_1 = require("./ip-detector");
const network_watcher_1 = require("./network-watcher");
const sync_manager_1 = require("./sync-manager");
const isDev = !electron_1.app.isPackaged;
const BACKEND_PORT = 3002; // Dùng port khác để tránh xung đột với server online
let mainWindow = null;
let serverManager;
let networkWatcher;
let syncManager;
// Đăng ký custom protocol để serve frontend static files
function registerAppProtocol() {
    electron_1.protocol.handle('app', (request) => {
        const url = request.url.replace('app://', '');
        const decodedUrl = decodeURIComponent(url);
        const frontendPath = path_1.default.join(__dirname, '../../frontend/dist');
        const filePath = path_1.default.join(frontendPath, decodedUrl);
        // Serve index.html cho mọi route không phải asset (SPA routing)
        if (!fs_1.default.existsSync(filePath) || fs_1.default.statSync(filePath).isDirectory()) {
            return electron_1.net.fetch(`file://${path_1.default.join(frontendPath, 'index.html')}`);
        }
        return electron_1.net.fetch(`file://${filePath}`);
    });
}
async function createMainWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'IE Offline',
        backgroundColor: '#0f172a',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false, // Cho phép load file:// URLs cho video
        },
        show: false,
    });
    // Loading screen trước khi NestJS ready
    mainWindow.webContents.loadURL(`data:text/html,<style>body{margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#94a3b8;font-size:18px}</style><body>Đang khởi động IE Offline...</body>`);
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
function setupIpcHandlers() {
    // === File Selection ===
    electron_1.ipcMain.handle('dialog:selectVideo', async () => {
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            title: 'Chọn file video',
            filters: [
                { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] },
            ],
            properties: ['openFile'],
        });
        if (result.canceled || result.filePaths.length === 0)
            return null;
        return result.filePaths[0];
    });
    electron_1.ipcMain.handle('dialog:exportData', async () => {
        const result = await electron_1.dialog.showSaveDialog(mainWindow, {
            title: 'Xuất dữ liệu',
            defaultPath: `ie-data-${new Date().toISOString().slice(0, 10)}.iedata`,
            filters: [{ name: 'IE Data File', extensions: ['iedata'] }],
        });
        return result.canceled ? null : result.filePath;
    });
    electron_1.ipcMain.handle('dialog:importData', async () => {
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            title: 'Nhập dữ liệu',
            filters: [{ name: 'IE Data File', extensions: ['iedata'] }],
            properties: ['openFile'],
        });
        if (result.canceled || result.filePaths.length === 0)
            return null;
        return result.filePaths[0];
    });
    electron_1.ipcMain.handle('file:readData', async (_event, filePath) => {
        try {
            const content = fs_1.default.readFileSync(filePath, 'utf-8');
            return { success: true, data: content };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    });
    electron_1.ipcMain.handle('file:writeData', async (_event, filePath, content) => {
        try {
            fs_1.default.writeFileSync(filePath, content, 'utf-8');
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    });
    electron_1.ipcMain.handle('file:getVideoUrl', (_event, filePath) => {
        // Trả về file:// URL cho video player
        return `file://${filePath.replace(/\\/g, '/')}`;
    });
    // === Network & Sync ===
    electron_1.ipcMain.handle('sync:getStatus', () => {
        return syncManager.getStatus();
    });
    electron_1.ipcMain.handle('sync:trigger', async () => {
        return syncManager.runSync();
    });
    electron_1.ipcMain.handle('network:isOnline', () => {
        return networkWatcher.isOnline();
    });
    // === Identity ===
    electron_1.ipcMain.handle('identity:getIp', () => {
        return ip_detector_1.IpDetector.getLocalIp();
    });
    electron_1.ipcMain.handle('identity:getHostname', () => {
        return ip_detector_1.IpDetector.getHostname();
    });
}
electron_1.app.whenReady().then(async () => {
    registerAppProtocol();
    // Khởi tạo các services
    serverManager = new server_manager_1.ServerManager(BACKEND_PORT);
    syncManager = new sync_manager_1.SyncManager(`http://127.0.0.1:${BACKEND_PORT}`);
    // Tạo cửa sổ trước (hiện loading screen)
    await createMainWindow();
    setupIpcHandlers();
    // Khởi động NestJS backend
    try {
        await serverManager.start();
        console.log(`[Main] NestJS backend started on port ${BACKEND_PORT}`);
    }
    catch (error) {
        console.error('[Main] Failed to start backend:', error);
        electron_1.dialog.showErrorBox('Lỗi khởi động', `Không thể khởi động backend server: ${error}`);
        electron_1.app.quit();
        return;
    }
    // Load frontend
    if (isDev) {
        await mainWindow?.loadURL('http://localhost:5173');
    }
    else {
        await mainWindow?.loadURL('app://./index.html');
    }
    // Khởi động network watcher và sync
    networkWatcher = new network_watcher_1.NetworkWatcher(() => {
        // Khi online
        console.log('[Main] Network online — triggering sync');
        mainWindow?.webContents.send('network:online');
        void syncManager.runSync().then(() => {
            mainWindow?.webContents.send('sync:completed', syncManager.getStatus());
        });
    }, () => {
        // Khi offline
        console.log('[Main] Network offline');
        mainWindow?.webContents.send('network:offline');
    });
    networkWatcher.start();
});
electron_1.app.on('window-all-closed', async () => {
    networkWatcher?.stop();
    await serverManager?.stop();
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', async () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow();
    }
});
//# sourceMappingURL=main.js.map
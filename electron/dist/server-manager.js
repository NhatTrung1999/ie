"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerManager = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const electron_1 = require("electron");
class ServerManager {
    constructor(port) {
        this.nestProcess = null;
        this.maxRetries = 30; // 30s timeout
        this.port = port;
    }
    ensureDatabaseExists(userDataPath, targetDbPath, isPackaged) {
        const fs = require('fs');
        if (!fs.existsSync(targetDbPath) || fs.statSync(targetDbPath).size === 0) {
            console.log(`[ServerManager] Offline database is missing or empty. Copying template...`);
            const templatePath = !isPackaged
                ? path_1.default.join(__dirname, '../../backend/ie-offline.db')
                : path_1.default.join(process.resourcesPath, 'backend/ie-offline.db');
            if (fs.existsSync(templatePath)) {
                fs.copyFileSync(templatePath, targetDbPath);
                console.log(`[ServerManager] Successfully initialized offline database from template.`);
            }
            else {
                console.error(`[ServerManager] ERROR: Template database not found at ${templatePath}`);
            }
        }
    }
    async start() {
        const isPackaged = electron_1.app.isPackaged;
        // Path tới NestJS bundle đã build
        const nestEntry = !isPackaged
            ? path_1.default.join(__dirname, '../../backend/dist/src/main.js')
            : path_1.default.join(process.resourcesPath, 'backend/main.js');
        // Môi trường chứa các templates Excel
        const templatesPath = !isPackaged
            ? path_1.default.join(__dirname, '../../backend/templates')
            : path_1.default.join(process.resourcesPath, 'backend/templates');
        const userData = electron_1.app.getPath('userData');
        const dbPath = path_1.default.join(userData, 'ie-offline.db');
        this.ensureDatabaseExists(userData, dbPath, isPackaged);
        console.log(`[ServerManager] Starting NestJS from: ${nestEntry}`);
        console.log(`[ServerManager] Database path: ${dbPath}`);
        console.log(`[ServerManager] Templates path: ${templatesPath}`);
        this.nestProcess = (0, child_process_1.fork)(nestEntry, [], {
            env: {
                ...process.env,
                PORT: String(this.port),
                DATABASE_URL: `file:${dbPath}`,
                OFFLINE_MODE: 'true',
                REMOTE_API_URL: process.env.REMOTE_API_URL || 'http://192.168.18.42:3003/api',
                NODE_ENV: 'production',
                TEMPLATES_PATH: templatesPath,
                // Bỏ qua JWT validation trong offline mode
                JWT_SECRET: 'offline-mode-secret-not-used',
            },
            silent: false, // Để xem NestJS logs trong console
        });
        this.nestProcess.on('error', (error) => {
            console.error('[ServerManager] NestJS process error:', error);
        });
        this.nestProcess.on('exit', (code) => {
            console.log(`[ServerManager] NestJS process exited with code ${code}`);
            this.nestProcess = null;
        });
        // Đợi server ready bằng cách poll HTTP
        await this.waitForServerReady();
    }
    async stop() {
        if (!this.nestProcess)
            return;
        return new Promise((resolve) => {
            this.nestProcess.once('exit', () => resolve());
            this.nestProcess.kill('SIGTERM');
            // Force kill sau 5s
            setTimeout(() => {
                this.nestProcess?.kill('SIGKILL');
                resolve();
            }, 5000);
        });
    }
    waitForServerReady() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const check = () => {
                attempts++;
                const req = http_1.default.get(`http://127.0.0.1:${this.port}/api`, (res) => {
                    res.resume();
                    if (res.statusCode && res.statusCode < 500) {
                        console.log(`[ServerManager] Backend ready after ${attempts} attempts`);
                        resolve();
                    }
                    else {
                        retry();
                    }
                });
                req.on('error', () => retry());
                req.setTimeout(1000, () => {
                    req.destroy();
                    retry();
                });
            };
            const retry = () => {
                if (attempts >= this.maxRetries) {
                    reject(new Error(`Backend did not start after ${this.maxRetries} seconds`));
                    return;
                }
                setTimeout(check, 1000);
            };
            // Bắt đầu sau 1s delay
            setTimeout(check, 1000);
        });
    }
    isRunning() {
        return this.nestProcess !== null && !this.nestProcess.killed;
    }
}
exports.ServerManager = ServerManager;
//# sourceMappingURL=server-manager.js.map
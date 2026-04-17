import { ChildProcess, fork } from 'child_process';
import path from 'path';
import http from 'http';
import { app } from 'electron';

export class ServerManager {
  private nestProcess: ChildProcess | null = null;
  private readonly port: number;
  private readonly maxRetries = 30; // 30s timeout

  constructor(port: number) {
    this.port = port;
  }

  private ensureDatabaseExists(userDataPath: string, targetDbPath: string, isPackaged: boolean) {
    const fs = require('fs');
    if (!fs.existsSync(targetDbPath) || fs.statSync(targetDbPath).size === 0) {
      console.log(`[ServerManager] Offline database is missing or empty. Copying template...`);
      
      const templatePath = !isPackaged
        ? path.join(__dirname, '../../backend/ie-offline.db')
        : path.join(process.resourcesPath, 'backend/ie-offline.db');

      if (fs.existsSync(templatePath)) {
        fs.copyFileSync(templatePath, targetDbPath);
        console.log(`[ServerManager] Successfully initialized offline database from template.`);
      } else {
        console.error(`[ServerManager] ERROR: Template database not found at ${templatePath}`);
      }
    }
  }

  async start(): Promise<void> {
    const isPackaged = app.isPackaged;

    // Path tới NestJS bundle đã build
    const nestEntry = !isPackaged
      ? path.join(__dirname, '../../backend/dist/src/main.js')
      : path.join(process.resourcesPath, 'backend/main.js');

    // Môi trường chứa các templates Excel
    const templatesPath = !isPackaged
      ? path.join(__dirname, '../../backend/templates')
      : path.join(process.resourcesPath, 'backend/templates');

    const userData = app.getPath('userData');
    const dbPath = path.join(userData, 'ie-offline.db');

    this.ensureDatabaseExists(userData, dbPath, isPackaged);

    console.log(`[ServerManager] Starting NestJS from: ${nestEntry}`);
    console.log(`[ServerManager] Database path: ${dbPath}`);
    console.log(`[ServerManager] Templates path: ${templatesPath}`);

    this.nestProcess = fork(nestEntry, [], {
      env: {
        ...process.env,
        PORT: String(this.port),
        DATABASE_URL: `file:${dbPath}`,
        OFFLINE_MODE: 'true',
        REMOTE_API_URL: process.env.REMOTE_API_URL || 'http://192.168.18.42:3001/api',
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

  async stop(): Promise<void> {
    if (!this.nestProcess) return;

    return new Promise((resolve) => {
      this.nestProcess!.once('exit', () => resolve());
      this.nestProcess!.kill('SIGTERM');

      // Force kill sau 5s
      setTimeout(() => {
        this.nestProcess?.kill('SIGKILL');
        resolve();
      }, 5000);
    });
  }

  private waitForServerReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      let attempts = 0;

      const check = () => {
        attempts++;
        const req = http.get(`http://127.0.0.1:${this.port}/api`, (res) => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) {
            console.log(`[ServerManager] Backend ready after ${attempts} attempts`);
            resolve();
          } else {
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

  isRunning(): boolean {
    return this.nestProcess !== null && !this.nestProcess.killed;
  }
}

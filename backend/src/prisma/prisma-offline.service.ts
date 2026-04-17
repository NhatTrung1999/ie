import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';

/**
 * PrismaService cho chế độ OFFLINE (SQLite).
 *
 * Dùng lazy require() bên trong constructor để load SQLite Prisma client.
 * Client này được generate riêng từ schema.sqlite.prisma vào client-sqlite.
 *
 * Cần chạy trước: npm run prisma:generate:sqlite
 */
@Injectable()
export class PrismaOfflineService implements OnModuleInit {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;

  // Model proxies — gán trong constructor, kiểu any để tránh conflict với MSSQL types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stageList: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stageCategory: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  machineType: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tableCT: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  historyEntry: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlSession: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deviceIdentity: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  syncLog: any;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl || databaseUrl === 'undefined') {
      throw new Error('[PrismaOffline] DATABASE_URL is invalid or undefined. Make sure it is set (e.g. file:./ie-offline.db)');
    }


    // Lazy require — chỉ chạy khi OFFLINE_MODE=true
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    let PrismaClientSQLite: any;
    try {
      // Node.js sẽ tự động dò tìm thư mục .prisma trong node_modules gần nhất 
      // (trong ie/backend/node_modules)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      PrismaClientSQLite = require('.prisma/client-sqlite').PrismaClient;
    } catch {
      throw new Error(
        '[PrismaOffline] SQLite Prisma client not found. Run: npm run prisma:generate:sqlite',
      );
    }
    // Đảm bảo env DATABASE_URL được set để Prisma Client luôn tìm thấy path
    process.env.DATABASE_URL = databaseUrl;

    // Prisma 7 requires driver adapters when not using static schema configs.
    // Lazy load the adapters so they don't block normal initialization
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaLibSql } = require('@prisma/adapter-libsql');

    // Mẫu Factory mới của Prisma 7: Adapter tự khởi tạo client dựa trên config object
    const adapter = new PrismaLibSql({ url: databaseUrl });

    this.client = new PrismaClientSQLite({ adapter });


    // Proxy tất cả model sang client
    this.stageList      = this.client.stageList;
    this.stageCategory  = this.client.stageCategory;
    this.machineType    = this.client.machineType;
    this.tableCT        = this.client.tableCT;
    this.historyEntry   = this.client.historyEntry;
    this.controlSession = this.client.controlSession;
    this.deviceIdentity = this.client.deviceIdentity;
    this.user           = this.client.user;
    this.syncLog        = this.client.syncLog;
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async $transaction(...args: any[]) {
    return this.client.$transaction(...args);
  }

  // Interceptor logic
  private translateMsSqlToSqlite(query: string): string | null {
    if (!query) return null;
    const q = query.toUpperCase();
    
    // 1. Bypass Schema Migration Scripts
    if (
      q.includes('IF OBJECT_ID') || 
      q.includes('SYS.COLUMNS') || 
      q.includes('SYS.TYPES') ||
      q.includes('SYS.DEFAULT_CONSTRAINTS') || 
      q.includes('ALTER TABLE') ||
      q.includes('IF COL_LENGTH') ||
      (q.includes('UPDATE T') && q.includes('FROM')) || // SQLite doesn't support UPDATE t SET ... FROM Table t
      (q.includes('UPDATE') && q.includes('[DBO]')) || // Legacy migration updates
      (q.includes('CREATE TABLE') && q.includes('[DBO]'))
    ) {
      return null;
    }

    // 2. Syntax Translation
    let sqliteQuery = query.replace(/\[dbo\]\.\[(.*?)\]/g, '"$1"');
    if (sqliteQuery.toUpperCase().includes('TRUNCATE TABLE')) {
      sqliteQuery = sqliteQuery.replace(/TRUNCATE TABLE/ig, 'DELETE FROM');
    }
    
    return sqliteQuery;
  }

  // Intercept Prisma.Sql objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private transformSqlObj(sqlObj: any) {
    if (sqlObj && Array.isArray(sqlObj.strings)) {
      sqlObj.strings = sqlObj.strings.map((str: string) => {
        let s = str.replace(/\[dbo\]\.\[(.*?)\]/g, '"$1"');
        return s;
      });
    }
    return sqlObj;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async $executeRawUnsafe(...args: any[]): Promise<any> {
    const query = typeof args[0] === 'string' ? args[0] : '';
    const translated = this.translateMsSqlToSqlite(query);
    if (translated === null) {
      return 0; // Bypass this query
    }
    return this.client.$executeRawUnsafe(translated, ...args.slice(1));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async $executeRaw(...args: any[]): Promise<any> {
    if (args[0] && Array.isArray(args[0].strings)) {
      args[0] = this.transformSqlObj(args[0]);
    }
    return this.client.$executeRaw(...args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async $queryRaw(...args: any[]): Promise<any> {
    if (args[0] && Array.isArray(args[0].strings)) {
      args[0] = this.transformSqlObj(args[0]);
    }
    return this.client.$queryRaw(...args);
  }

  async $connect() {
    return this.client.$connect();
  }

  async $disconnect() {
    return this.client.$disconnect();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async $queryRawUnsafe(...args: any[]): Promise<any> {
    const query = typeof args[0] === 'string' ? args[0] : '';
    const translated = this.translateMsSqlToSqlite(query);
    if (translated === null) {
      return []; // Return empty array to bypass safely without breaking maps
    }
    return this.client.$queryRawUnsafe(translated, ...args.slice(1));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async enableShutdownHooks(_app: INestApplication) {
    await this.client.$disconnect();
  }
}

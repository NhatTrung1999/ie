import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {
    const connectionString = configService.get<string>('DATABASE_URL');

    if (!connectionString) {
      throw new Error('DATABASE_URL is required for Prisma.');
    }

    super({
      adapter: new PrismaMssql(parseSqlServerConnectionString(connectionString)),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication) {
    (this as PrismaClient & {
      $on(event: 'beforeExit', callback: () => Promise<void>): void;
    }).$on('beforeExit', async () => {
      await app.close();
    });
  }

  get machineType() {
    return super.machineType;
  }
}

function parseSqlServerConnectionString(connectionString: string) {
  const normalized = connectionString.replace(/^sqlserver:\/\//i, '');
  const [hostPort, ...segments] = normalized.split(';');
  const [server, portValue] = hostPort.split(':');
  const values = Object.fromEntries(
    segments
      .map((segment) => segment.split('='))
      .filter(([key, value]) => Boolean(key && value))
      .map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    server,
    port: Number(portValue || 1433),
    user: values.user || values.username || values.uid,
    password: values.password || values.pwd,
    database: values.database || values['initial catalog'],
    options: {
      encrypt: values.encrypt !== 'false',
      trustServerCertificate: values.trustservercertificate === 'true',
    },
  };
}

import { Global, Module, Provider } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { PrismaService } from './prisma.service';
import { PrismaOfflineService } from './prisma-offline.service';

const isOffline = process.env.OFFLINE_MODE === 'true';

/**
 * Trong offline mode (Electron): dùng PrismaOfflineService (SQLite)
 * Trong online mode (server):    dùng PrismaService (SQL Server)
 */
const prismaProvider: Provider = {
  provide: PrismaClient,
  useClass: isOffline ? PrismaOfflineService : PrismaService,
};

@Global()
@Module({
  providers: [
    prismaProvider,
    // Alias để tương thích code cũ dùng PrismaService trực tiếp
    {
      provide: PrismaService,
      useExisting: PrismaClient,
    },
  ],
  exports: [PrismaClient, PrismaService],
})
export class PrismaModule {}

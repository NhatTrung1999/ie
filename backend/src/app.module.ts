import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ControlSessionModule } from './control-session/control-session.module';
import { DeleteLogModule } from './delete-log/delete-log.module';
import { PrismaModule } from './prisma/prisma.module';
import { HistoryModule } from './history/history.module';
import { MachineTypeModule } from './machine-type/machine-type.module';
import { StageModule } from './stage/stage.module';
import { StageCategoryModule } from './stage-category/stage-category.module';
import { TableCtModule } from './table-ct/table-ct.module';
import { UsersModule } from './users/users.module';
import { validate } from './config/env.validation';
import { IdentityModule } from './identity/identity.module';
import { SyncModule } from './sync/sync.module';
import { RemoteSyncController } from './sync/remote-sync.controller';

const isOffline = process.env.OFFLINE_MODE === 'true';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Offline mode đọc .env.offline, online đọc .env bình thường
      envFilePath: isOffline ? ['.env.offline', '.env'] : '.env',
      validate,
    }),
    PrismaModule,
    DeleteLogModule,
    UsersModule,
    // AuthModule vẫn load nhưng guards sẽ bypass khi offline
    AuthModule,
    ControlSessionModule,
    HistoryModule,
    MachineTypeModule,
    StageCategoryModule,
    StageModule,
    TableCtModule,
    // Offline-only modules
    ...(isOffline ? [IdentityModule, SyncModule] : []),
  ],
  controllers: [
    AppController,
    // Online server thêm RemoteSyncController để nhận data từ offline clients
    ...(!isOffline ? [RemoteSyncController] : []),
  ],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}



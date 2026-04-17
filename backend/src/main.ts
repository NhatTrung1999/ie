import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import express from 'express';
import { AppModule } from './app.module';

const isOffline = process.env.OFFLINE_MODE === 'true';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Tắt logs verbose trong offline mode để không spam console Electron
    logger: isOffline ? ['error', 'warn'] : ['log', 'error', 'warn', 'debug'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3002);

  if (isOffline) {
    // Offline (Electron): cho phép tất cả origins (app://, file://, localhost)
    app.enableCors({ origin: true, credentials: true });
  } else {
    // Online: chỉ cho phép các origins đã biết
    const configuredFrontendUrl = configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://192.168.18.42:5173',
      configuredFrontendUrl,
    ];

    app.enableCors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} is not allowed by CORS.`), false);
      },
      credentials: true,
    });
  }

  app.setGlobalPrefix('api');

  // Serve thư mục uploads — dùng path tuyệt đối trong offline mode
  const uploadsPath = isOffline
    ? (process.env.UPLOADS_PATH ?? join(process.cwd(), 'uploads'))
    : join(process.cwd(), 'uploads');

  app.use('/uploads', express.static(uploadsPath));

  await app.listen(port);

  // Thông báo cho Electron main process rằng server đã ready
  if (process.send) {
    process.send('ready');
  }

  if (!isOffline) {
    console.log(`[NestJS] Server running on http://localhost:${port}`);
  }
}

bootstrap();


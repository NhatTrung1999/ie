import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL', 'http://localhost:5173'),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));
  await app.listen(configService.get<number>('PORT', 3000));
}
bootstrap();

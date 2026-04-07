import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';

import { diskStorage } from 'multer';

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase();
}

export const stageUploadDir = join(process.cwd(), 'uploads', 'stages');

export function ensureStageUploadDir() {
  if (!existsSync(stageUploadDir)) {
    mkdirSync(stageUploadDir, { recursive: true });
  }
}

export const stageUploadStorage = diskStorage({
  destination: (_req, _file, cb) => {
    ensureStageUploadDir();
    cb(null, stageUploadDir);
  },
  filename: (_req, file, cb) => {
    const safeName = sanitizeFileName(file.originalname.replace(extname(file.originalname), ''));
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${safeName || 'video'}-${suffix}${extname(file.originalname)}`);
  },
});

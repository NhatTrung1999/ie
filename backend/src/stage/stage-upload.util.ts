import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

import type { Request } from 'express';
import type { StorageEngine } from 'multer';

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase();
}

function sanitizePathSegment(value: string | undefined, fallback: string) {
  const normalized = sanitizeFileName((value ?? '').trim());
  return normalized || fallback;
}

export const stageUploadDir = join(process.cwd(), 'uploads');

export function ensureStageUploadDir() {
  if (!existsSync(stageUploadDir)) {
    mkdirSync(stageUploadDir, { recursive: true });
  }
}

function createStageUploadDirectory(req: Request) {
  const body = (req.body ?? {}) as Record<string, string | undefined>;
  const dateSegment = sanitizePathSegment(body.date, 'unknown-date');
  const seasonSegment = sanitizePathSegment(body.season, 'unknown-season');
  const stageSegment = sanitizePathSegment(body.stageCode, 'unknown-stage');
  const areaSegment = sanitizePathSegment(body.area, 'unknown-area');
  const articleSegment = sanitizePathSegment(body.article, 'unknown-article');

  const directory = join(
    stageUploadDir,
    dateSegment,
    seasonSegment,
    stageSegment,
    areaSegment,
    articleSegment,
  );

  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  return directory;
}

function createUploadFileName(originalName: string) {
  const safeName = sanitizeFileName(originalName.replace(extname(originalName), ''));
  const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${safeName || 'video'}-${suffix}${extname(originalName)}`;
}

export function getStageVideoUrl(filePath: string) {
  const relativePath = relative(join(process.cwd(), 'uploads'), filePath)
    .split('\\')
    .join('/');

  return `/uploads/${relativePath}`;
}

export const stageUploadStorage: StorageEngine = {
  _handleFile(req: Request, file, cb) {
    ensureStageUploadDir();

    const destinationDir = createStageUploadDirectory(req);
    const fileName = createUploadFileName(file.originalname);
    const filePath = join(destinationDir, fileName);
    const outStream = createWriteStream(filePath);
    let settled = false;
    let cleanedUp = false;
    let completed = false;

    const cleanupFile = async () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;

      try {
        await unlink(filePath);
      } catch {
        // Ignore cleanup failures for partially written files.
      }
    };

    const abortUpload = (error: Error) => {
      if (completed || settled) {
        return;
      }

      settled = true;
      outStream.destroy(error);
      void cleanupFile();
      cb(error);
    };

    req.once('aborted', () => {
      abortUpload(new Error('Upload aborted by client.'));
    });

    file.stream.once('error', (error) => {
      abortUpload(error);
    });

    outStream.once('error', (error) => {
      abortUpload(error);
    });

    outStream.once('finish', () => {
      if (settled) {
        return;
      }

      settled = true;
      completed = true;
      cb(null, {
        destination: destinationDir,
        filename: fileName,
        path: filePath,
        size: outStream.bytesWritten,
      });
    });

    file.stream.pipe(outStream);
  },
  _removeFile(_req, file, cb) {
    const filePath = typeof file.path === 'string' ? file.path : '';

    if (!filePath) {
      cb(null);
      return;
    }

    unlink(filePath)
      .then(() => cb(null))
      .catch(() => cb(null));
  },
};

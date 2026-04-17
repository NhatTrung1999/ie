type EnvironmentVariables = {
  PORT?: string;
  FRONTEND_URL?: string;
  JWT_SECRET?: string;
  DATABASE_URL?: string;
  OFFLINE_MODE?: string;
  REMOTE_API_URL?: string;
  OFFLINE_SYNC_KEY?: string;
};

export function validate(config: EnvironmentVariables) {
  const port = Number(config.PORT ?? 3000);
  const isOffline = config.OFFLINE_MODE === 'true';

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid integer between 1 and 65535.');
  }

  // JWT_SECRET không bắt buộc trong offline mode
  if (!isOffline && !config.JWT_SECRET?.trim()) {
    throw new Error('JWT_SECRET is required.');
  }

  if (!config.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required.');
  }

  return {
    PORT: String(port),
    FRONTEND_URL: config.FRONTEND_URL?.trim() || 'http://localhost:5173',
    JWT_SECRET: config.JWT_SECRET?.trim() || 'offline-placeholder',
    DATABASE_URL: config.DATABASE_URL.trim(),
    OFFLINE_MODE: config.OFFLINE_MODE || 'false',
    REMOTE_API_URL: config.REMOTE_API_URL?.trim() || 'http://192.168.18.42:3001/api',
    OFFLINE_SYNC_KEY: config.OFFLINE_SYNC_KEY?.trim() || 'ie-offline-sync-2025',
  };
}


import axios from 'axios';

import { getStoredToken } from '@/lib/storage';

// Detect Electron (offline mode) — dùng local NestJS thay vì remote server
const isElectronEnv = typeof window !== 'undefined' && 'electronAPI' in window;
const OFFLINE_API_URL = 'http://127.0.0.1:3002/api';
const ONLINE_API_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://192.168.18.42:3001/api';

const API_BASE_URL = isElectronEnv ? OFFLINE_API_URL : ONLINE_API_URL;

export const UNAUTHORIZED_EVENT = 'ie-auth-unauthorized';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
});

apiClient.interceptors.request.use((config) => {
  // Offline mode: không cần Authorization header
  if (isElectronEnv) return config;

  const token = getStoredToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Offline mode: bỏ qua 401 (không có JWT)
    if (!isElectronEnv && error?.response?.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }

    return Promise.reject(error);
  },
);


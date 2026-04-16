import axios from 'axios';

import { getStoredToken } from '@/lib/storage';

// In dev mode, Vite proxies /api/* → backend (same-origin → SW can cache it)
// In prod, use the explicit env var
const API_BASE_URL = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL ?? 'http://192.168.18.42:3001/api');

export const UNAUTHORIZED_EVENT = 'ie-auth-unauthorized';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
});

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  },
);

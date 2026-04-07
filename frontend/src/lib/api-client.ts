import axios from 'axios';

import { getStoredToken } from '@/lib/storage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api';
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

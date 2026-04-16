import { AxiosError } from 'axios';

import { apiClient } from '@/lib/api-client';
import type { SessionUser } from '@/lib/storage';

type LoginPayload = {
  username: string;
  password: string;
  category: string;
};

type LoginResponse = {
  accessToken: string;
  user: {
    username: string;
    displayName: string;
    category: string;
  };
};

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    return (
      (typeof error.response?.data?.message === 'string' && error.response.data.message) ||
      (error.code === 'ECONNABORTED' ? 'Request timed out.' : error.message) ||
      fallback
    );
  }

  return error instanceof Error ? error.message : fallback;
}

export async function loginRequest(payload: LoginPayload) {
  try {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', payload);

    return {
      accessToken: data.accessToken,
      user: {
        username: data.user.username || payload.username,
        displayName: data.user.displayName || payload.username,
        category: data.user.category || payload.category,
      },
    };
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to sign in right now.'));
  }
}

export async function getCurrentUser() {
  try {
    const { data } = await apiClient.get<{
      user: {
        username?: string;
        displayName?: string;
        category?: string;
      };
    }>('/auth/me');

    const user: SessionUser = {
      username: data.user.displayName || data.user.username || 'Administrator',
      category: data.user.category || 'FF28',
    };

    return user;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Session expired or token is invalid.'));
  }
}

export async function registerUser(payload: {
  username: string;
  displayName: string;
  password: string;
}) {
  try {
    const { data } = await apiClient.post<{
      user?: AuthUser;
    }>('/auth/register', payload);

    return data.user;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to create user right now.'));
  }
}

export async function fetchUsers() {
  try {
    const { data } = await apiClient.get<{
      users?: AuthUser[];
    }>('/auth/users');

    return data.users ?? [];
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to load users right now.'));
  }
}

export async function deleteUser(id: string) {
  try {
    await apiClient.delete(`/auth/users/${id}`);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to delete user right now.'));
  }
}

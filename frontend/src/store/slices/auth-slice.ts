import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import {
  clearStoredSession,
  getStoredSessionUser,
  getStoredToken,
  persistSession,
  type SessionUser,
} from '@/lib/storage';
import { getCurrentUser, loginRequest } from '@/services/auth';
import { isElectron } from '@/lib/electron-bridge';
import { apiClient } from '@/lib/api-client';

type AuthState = {
  isAuthenticated: boolean;
  sessionUser: SessionUser & { ip?: string; hostname?: string };
  isBootstrapping: boolean;
};

const initialState: AuthState = {
  // Trong Electron offline mode: luôn authenticated (không cần login)
  isAuthenticated: isElectron() || Boolean(getStoredToken()),
  sessionUser: getStoredSessionUser(),
  isBootstrapping: true,
};

export const bootstrapSession = createAsyncThunk(
  'auth/bootstrapSession',
  async (_, { rejectWithValue }) => {
    // Offline (Electron): không cần token, lấy identity từ IP
    if (isElectron()) {
      try {
        const { data } = await apiClient.get<{ ip: string; hostname: string }>('/identity');
        return {
          username: data.hostname || data.ip,
          category: data.ip,
          ip: data.ip,
          hostname: data.hostname,
        } as SessionUser & { ip: string; hostname: string };
      } catch {
        return {
          username: 'Offline',
          category: '127.0.0.1',
          ip: '127.0.0.1',
          hostname: 'offline',
        };
      }
    }

    // Online mode: kiểm tra JWT token
    const token = getStoredToken();

    if (!token) {
      return null;
    }

    try {
      return await getCurrentUser();
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Session expired or token is invalid.',
      );
    }
  },
);

export const signIn = createAsyncThunk(
  'auth/signIn',
  async (
    payload: {
      username: string;
      password: string;
      category: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const result = await loginRequest(payload);
      const nextSessionUser = {
        username: result.user.displayName || result.user.username || payload.username,
        category: result.user.category || payload.category,
      };

      persistSession(result.accessToken, nextSessionUser);

      return nextSessionUser;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to sign in right now.',
      );
    }
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signOut(state) {
      // Trong offline mode: không cho sign out (không có login)
      if (isElectron()) return;

      clearStoredSession();
      state.isAuthenticated = false;
      state.sessionUser = { username: 'Administrator', category: 'FF28' };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapSession.fulfilled, (state, action) => {
        if (action.payload) {
          state.isAuthenticated = true;
          state.sessionUser = action.payload;
        } else {
          state.isAuthenticated = false;
        }
        state.isBootstrapping = false;
      })
      .addCase(bootstrapSession.rejected, (state) => {
        if (!isElectron()) {
          clearStoredSession();
          state.isAuthenticated = false;
        } else {
          // Offline: vẫn authenticated dù bootstrap fail
          state.isAuthenticated = true;
        }
        state.isBootstrapping = false;
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.isAuthenticated = true;
        state.sessionUser = action.payload;
      });
  },
});

export const { signOut } = authSlice.actions;
export const authReducer = authSlice.reducer;

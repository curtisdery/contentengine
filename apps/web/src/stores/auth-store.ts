'use client';

import { create } from 'zustand';
import { apiClient, ApiClientError } from '@/lib/api';
import { storeTokens, clearStoredTokens, getStoredTokens } from '@/lib/auth';
import type { User } from '@/types/user';
import type { LoginResponse, SignupResponse, RefreshResponse } from '@/types/api';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  setTokens: (access: string, refresh: string) => void;
  clearAuth: () => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const response = await apiClient.post<LoginResponse>(
        '/api/v1/auth/login',
        { email, password },
        true
      );

      storeTokens(response.access_token, response.refresh_token);
      set({
        user: response.user,
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      if (error instanceof ApiClientError) {
        throw new Error(error.detail);
      }
      throw new Error('Failed to log in. Please try again.');
    }
  },

  signup: async (email: string, password: string, fullName: string) => {
    set({ isLoading: true });
    try {
      const response = await apiClient.post<SignupResponse>(
        '/api/v1/auth/signup',
        { email, password, full_name: fullName },
        true
      );

      storeTokens(response.access_token, response.refresh_token);
      set({
        user: response.user,
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      if (error instanceof ApiClientError) {
        throw new Error(error.detail);
      }
      throw new Error('Failed to create account. Please try again.');
    }
  },

  logout: async () => {
    try {
      await apiClient.post('/api/v1/auth/logout');
    } catch {
      // Proceed with logout even if API call fails
    }

    clearStoredTokens();
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },

  refreshAuth: async () => {
    const { refreshToken } = get();
    if (!refreshToken) {
      get().clearAuth();
      return;
    }

    try {
      const response = await apiClient.post<RefreshResponse>(
        '/api/v1/auth/refresh',
        { refresh_token: refreshToken },
        true
      );

      storeTokens(response.access_token, response.refresh_token);
      set({
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
      });
    } catch {
      get().clearAuth();
    }
  },

  setTokens: (access: string, refresh: string) => {
    storeTokens(access, refresh);
    set({
      accessToken: access,
      refreshToken: refresh,
    });
  },

  clearAuth: () => {
    clearStoredTokens();
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },

  initialize: async () => {
    const { accessToken, refreshToken } = getStoredTokens();

    if (!accessToken) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }

    set({ accessToken, refreshToken });

    try {
      const user = await apiClient.get<User>('/api/v1/auth/me');
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      // Token might be expired, try refresh
      if (refreshToken) {
        try {
          const response = await apiClient.post<RefreshResponse>(
            '/api/v1/auth/refresh',
            { refresh_token: refreshToken },
            true
          );

          storeTokens(response.access_token, response.refresh_token);
          set({
            accessToken: response.access_token,
            refreshToken: response.refresh_token,
          });

          const user = await apiClient.get<User>('/api/v1/auth/me');
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          clearStoredTokens();
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      } else {
        clearStoredTokens();
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    }
  },
}));

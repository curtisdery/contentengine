'use client';

import { create } from 'zustand';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  onIdTokenChanged,
  updateProfile,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { apiClient } from '@/lib/api';
import { trackEvent } from '@/lib/analytics';
import type { User } from '@/types/user';

const googleProvider = new GoogleAuthProvider();

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  signup: (email: string, password: string, fullName: string) => Promise<void>;
  signupWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearAuth: () => void;
  initialize: () => (() => void);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      await signInWithEmailAndPassword(auth, email, password);
      trackEvent('login', { method: 'email' });
      // The onIdTokenChanged listener will handle fetching user data
    } catch (error: unknown) {
      set({ isLoading: false });
      const firebaseError = error as { code?: string };
      if (firebaseError.code === 'auth/invalid-credential' || firebaseError.code === 'auth/wrong-password') {
        throw new Error('Invalid email or password');
      }
      if (firebaseError.code === 'auth/user-not-found') {
        throw new Error('No account found with this email');
      }
      if (firebaseError.code === 'auth/too-many-requests') {
        throw new Error('Too many failed attempts. Please try again later.');
      }
      throw new Error('Failed to log in. Please try again.');
    }
  },

  loginWithGoogle: async () => {
    set({ isLoading: true });
    try {
      await signInWithPopup(auth, googleProvider);
      trackEvent('login', { method: 'google' });
      // The onIdTokenChanged listener will handle fetching user data
    } catch (error: unknown) {
      set({ isLoading: false });
      const firebaseError = error as { code?: string };
      if (firebaseError.code === 'auth/popup-closed-by-user') {
        return; // User cancelled — not an error
      }
      throw new Error('Google sign-in failed. Please try again.');
    }
  },

  signup: async (email: string, password: string, fullName: string) => {
    set({ isLoading: true });
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: fullName });

      // Sync with backend
      const idToken = await credential.user.getIdToken();
      await apiClient.post(
        '/api/v1/auth/signup',
        { firebase_token: idToken, full_name: fullName },
        true
      );
      trackEvent('sign_up', { method: 'email' });
      // The onIdTokenChanged listener will handle setting user state
    } catch (error: unknown) {
      set({ isLoading: false });
      const firebaseError = error as { code?: string };
      if (firebaseError.code === 'auth/email-already-in-use') {
        throw new Error('An account with this email already exists');
      }
      if (firebaseError.code === 'auth/weak-password') {
        throw new Error('Password is too weak');
      }
      throw new Error('Failed to create account. Please try again.');
    }
  },

  signupWithGoogle: async () => {
    set({ isLoading: true });
    try {
      const credential = await signInWithPopup(auth, googleProvider);

      // Sync with backend
      const idToken = await credential.user.getIdToken();
      const displayName = credential.user.displayName || credential.user.email?.split('@')[0] || 'User';
      await apiClient.post(
        '/api/v1/auth/signup',
        { firebase_token: idToken, full_name: displayName },
        true
      );
      trackEvent('sign_up', { method: 'google' });
      // The onIdTokenChanged listener will handle setting user state
    } catch (error: unknown) {
      set({ isLoading: false });
      const firebaseError = error as { code?: string };
      if (firebaseError.code === 'auth/popup-closed-by-user') {
        return;
      }
      throw new Error('Google sign-up failed. Please try again.');
    }
  },

  logout: async () => {
    try {
      await apiClient.post('/api/v1/auth/logout');
    } catch {
      // Proceed with logout even if API call fails
    }

    await signOut(auth);
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },

  resetPassword: async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  },

  clearAuth: () => {
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },

  initialize: () => {
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const user = await apiClient.get<User>('/api/v1/auth/me');
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      } else {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    });

    return unsubscribe;
  },
}));

'use client';

import { useCallback } from 'react';
import { create } from 'zustand';
import { TOAST_DURATION } from '@/lib/constants';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

let toastCounter = 0;

const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${++toastCounter}`;
    const newToast: Toast = {
      id,
      title: toast.title,
      description: toast.description,
      variant: toast.variant,
      duration: toast.duration ?? TOAST_DURATION,
    };

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }));

    return id;
  },

  removeToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearToasts: () => {
    set({ toasts: [] });
  },
}));

export function useToast() {
  const { toasts, addToast, removeToast, clearToasts } = useToastStore();

  const toast = useCallback((props: Omit<Toast, 'id' | 'duration' | 'variant'> & { variant?: ToastVariant; duration?: number }) => {
    return addToast({
      variant: 'default',
      ...props,
    });
  }, [addToast]);

  const success = useCallback((title: string, description?: string) => {
    return addToast({ title, description, variant: 'success' });
  }, [addToast]);

  const error = useCallback((title: string, description?: string) => {
    return addToast({ title, description, variant: 'error' });
  }, [addToast]);

  const warning = useCallback((title: string, description?: string) => {
    return addToast({ title, description, variant: 'warning' });
  }, [addToast]);

  return {
    toasts,
    toast,
    success,
    error,
    warning,
    removeToast,
    clearToasts,
  };
}

export { useToastStore };

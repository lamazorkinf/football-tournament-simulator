import { create } from 'zustand';
import { nanoid } from 'nanoid';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  /** Devuelve el id del toast, para poder cerrarlo antes de que expire. */
  addToast: (message: string, type: ToastType, duration?: number) => string;
  removeToast: (id: string) => void;
  success: (message: string, duration?: number) => string;
  error: (message: string, duration?: number) => string;
  info: (message: string, duration?: number) => string;
  warning: (message: string, duration?: number) => string;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message: string, type: ToastType, duration = 5000) => {
    // Math.random().toString(36).substring(7) puede devolver cadena vacía
    // cuando el float se serializa corto: dos toasts con id '' se eliminaban
    // juntos al cerrar cualquiera de los dos.
    const id = nanoid();
    const toast: Toast = { id, message, type, duration };

    set((state) => ({
      toasts: [...state.toasts, toast],
    }));

    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }

    return id;
  },

  removeToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  success: (message: string, duration?: number): string =>
    useToastStore.getState().addToast(message, 'success', duration),

  error: (message: string, duration?: number): string =>
    useToastStore.getState().addToast(message, 'error', duration),

  info: (message: string, duration?: number): string =>
    useToastStore.getState().addToast(message, 'info', duration),

  warning: (message: string, duration?: number): string =>
    useToastStore.getState().addToast(message, 'warning', duration),
}));

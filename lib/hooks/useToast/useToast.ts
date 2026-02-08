import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  showToast: (message: string) => void;
  hideToast: (id: string) => void;
}

let toastIdCounter = 0;

/**
 * Zustand store for managing toast notifications
 * Provides the same API as the previous React hook but powered by zustand
 */
export const useToast = create<ToastState>((set) => ({
  toasts: [],

  showToast: (message: string) => {
    const id = `toast-${++toastIdCounter}`;
    const newToast: Toast = { id, message };

    set((state) => ({ toasts: [...state.toasts, newToast] }));

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 3000);
  },

  hideToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

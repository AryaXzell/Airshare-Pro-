import { useCallback, useState } from 'react';
import { ToastInfo } from '../types';

export interface ShowToastOptions {
  description?: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastInfo[]>([]);

  const showToast = useCallback(
    (message: string, options?: ShowToastOptions) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastInfo = {
        id,
        message,
        description: options?.description,
        type: options?.type || 'success',
      };
      setToasts((current) => [...current, newToast]);

      const duration = options?.duration ?? 3200;
      if (duration > 0 && duration !== Infinity) {
        setTimeout(() => {
          setToasts((current) => current.filter((t) => t.id !== id));
        }, duration);
      }

      return id;
    },
    []
  );

  const hideToast = useCallback((id?: string) => {
    if (id) {
      setToasts((current) => current.filter((t) => t.id !== id));
    } else {
      setToasts((current) => (current.length > 0 ? current.slice(1) : current));
    }
  }, []);

  return {
    toast: toasts[toasts.length - 1] || null,
    toasts,
    showToast,
    hideToast,
  };
}


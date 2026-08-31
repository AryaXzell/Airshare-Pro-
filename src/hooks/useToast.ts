import { useCallback, useState } from 'react';
import { ToastInfo } from '../types';

export function useToast() {
  const [toast, setToast] = useState<ToastInfo | null>(null);

  const showToast = useCallback((message: string, options?: { description?: string; type?: 'success' | 'error' | 'warning' | 'info'; duration?: number }) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastInfo = {
      id,
      message,
      description: options?.description,
      type: options?.type || 'success',
    };
    setToast(newToast);

    const duration = options?.duration ?? 3200;
    setTimeout(() => {
      setToast(current => (current?.id === id ? null : current));
    }, duration);
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  return { toast, showToast, hideToast };
}

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { ToastInfo } from '../../types';

interface ToastProps {
  toast?: ToastInfo | null;
  toasts?: ToastInfo[];
  onClose: (id?: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, toasts: propToasts, onClose }) => {
  // Support both single toast (backward compatible) and full toast stack
  const activeToasts: ToastInfo[] = propToasts
    ? propToasts
    : toast
    ? [toast]
    : [];

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none px-4 w-full max-w-sm flex flex-col items-center space-y-2"
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence mode="popLayout">
        {activeToasts.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.94 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="pointer-events-auto w-full clean-surface-elevated rounded-2xl p-3 sm:p-3.5 shadow-xl flex items-center justify-between space-x-3 border"
            style={{
              backgroundColor: 'var(--surface-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
            role="status"
          >
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              <div className="flex-shrink-0">
                {item.type === 'error' ? (
                  <div className="p-1.5 rounded-full bg-rose-500/15 text-rose-500">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                ) : item.type === 'warning' ? (
                  <div className="p-1.5 rounded-full bg-amber-500/15 text-amber-500">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                ) : item.type === 'info' ? (
                  <div className="p-1.5 rounded-full bg-sky-500/15 text-sky-500">
                    <Info className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="p-1.5 rounded-full bg-emerald-500/15 text-emerald-500">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold leading-snug truncate" style={{ color: 'var(--text-main)' }}>
                  {item.message}
                </p>
                {item.description && (
                  <p className="text-[11px] opacity-65 leading-tight truncate" style={{ color: 'var(--text-muted)' }}>
                    {item.description}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => onClose(item.id)}
              className="p-1 rounded-full clean-interactive opacity-60 hover:opacity-100 transition-opacity flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              aria-label="Tutup notifikasi"
              title="Tutup notifikasi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};


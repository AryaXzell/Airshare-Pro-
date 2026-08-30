import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { ToastInfo } from '../../types';

interface ToastProps {
  toast: ToastInfo | null;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none px-4 w-full max-w-sm">
      <AnimatePresence mode="wait">
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="pointer-events-auto clean-surface-elevated rounded-2xl p-3 sm:p-3.5 shadow-xl flex items-center justify-between space-x-3 border"
            style={{
              backgroundColor: 'var(--surface-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center space-x-3 min-w-0">
              <div className="flex-shrink-0">
                {toast.type === 'error' ? (
                  <div className="p-1.5 rounded-full bg-rose-500/15 text-rose-500">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                ) : toast.type === 'info' ? (
                  <div className="p-1.5 rounded-full bg-sky-500/15 text-sky-500">
                    <Info className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="p-1.5 rounded-full bg-emerald-500/15 text-emerald-500">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold leading-snug truncate" style={{ color: 'var(--text-main)' }}>
                  {toast.message}
                </p>
                {toast.description && (
                  <p className="text-[11px] opacity-65 leading-tight truncate" style={{ color: 'var(--text-muted)' }}>
                    {toast.description}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-full clean-interactive opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
              aria-label="Tutup notifikasi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

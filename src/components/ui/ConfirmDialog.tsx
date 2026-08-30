import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 clean-backdrop"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="relative w-full max-w-sm rounded-[2rem] p-6 clean-surface-elevated z-10 border text-center"
            style={{
              backgroundColor: 'var(--surface-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div
              className={`w-11 h-11 rounded-2xl mx-auto mb-3.5 flex items-center justify-center ${
                isDestructive ? 'bg-rose-500/15 text-rose-500' : 'bg-blue-500/15 text-blue-500'
              }`}
            >
              <AlertCircle className="w-5 h-5" />
            </div>

            <h3 className="text-base font-extrabold tracking-tight mb-1.5" style={{ color: 'var(--text-main)' }}>
              {title}
            </h3>
            <p className="text-xs opacity-70 leading-relaxed mb-5" style={{ color: 'var(--text-muted)' }}>
              {description}
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={onCancel}
                className="py-2.5 px-4 rounded-xl font-bold text-xs clean-interactive clean-tap border"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`py-2.5 px-4 rounded-xl font-bold text-xs transition-all clean-tap shadow-xs ${
                  isDestructive
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'text-white'
                }`}
                style={!isDestructive ? { backgroundColor: 'var(--accent)', color: 'var(--accent-text)' } : {}}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

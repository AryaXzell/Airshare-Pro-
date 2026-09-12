import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { AlertCircle } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  showServerToggle?: boolean;
  serverToggleLabel?: string;
  serverToggleDescription?: string;
  deleteFromServer?: boolean;
  onServerToggleChange?: (checked: boolean) => void;
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
  isLoading = false,
  showServerToggle = false,
  serverToggleLabel,
  serverToggleDescription,
  deleteFromServer = true,
  onServerToggleChange,
  onConfirm,
  onCancel,
}) => {
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      // Save previously focused element to restore when dialog closes
      triggerElementRef.current = document.activeElement as HTMLElement | null;

      // Auto-focus with safety: focus Cancel if destructive, Confirm otherwise
      const timer = setTimeout(() => {
        if (isDestructive) {
          cancelButtonRef.current?.focus();
        } else {
          confirmButtonRef.current?.focus();
        }
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
          return;
        }

        // Focus Trap: constrain Tab / Shift+Tab navigation to the dialog buttons
        if (e.key === 'Tab') {
          const focusable = [cancelButtonRef.current, confirmButtonRef.current].filter(
            Boolean
          ) as HTMLButtonElement[];
          if (focusable.length === 0) return;

          const firstEl = focusable[0];
          const lastEl = focusable[focusable.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === firstEl || !dialogRef.current?.contains(document.activeElement)) {
              e.preventDefault();
              lastEl.focus();
            }
          } else {
            if (document.activeElement === lastEl || !dialogRef.current?.contains(document.activeElement)) {
              e.preventDefault();
              firstEl.focus();
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', handleKeyDown);
        // Restore focus to triggering element
        if (triggerElementRef.current && typeof triggerElementRef.current.focus === 'function') {
          triggerElementRef.current.focus();
        }
      };
    }
  }, [isOpen, isDestructive, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          {/* Static Blur Layer (Option A: instant blur mount without animated opacity to eliminate GPU jank) */}
          <div className="fixed inset-0 clean-backdrop-blur pointer-events-none" />

          {/* Animated Dark Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.15, ease: 'easeOut' }}
            onClick={onCancel}
            className="fixed inset-0 clean-backdrop-overlay cursor-pointer"
          />

          <motion.div
            ref={dialogRef}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 6 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 6 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.15, ease: 'easeOut' }}
            onAnimationComplete={() => setIsAnimating(false)}
            className="relative w-full max-w-sm rounded-[2rem] p-6 clean-surface-elevated z-10 border text-center"
            style={{
              backgroundColor: 'var(--surface-elevated)',
              borderColor: 'var(--border-subtle)',
              willChange: isAnimating && !shouldReduceMotion ? 'transform, opacity' : 'auto',
            }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-desc"
          >
            <div
              className={`w-11 h-11 rounded-2xl mx-auto mb-3.5 flex items-center justify-center ${
                isDestructive ? 'bg-rose-500/15 text-rose-500' : 'bg-blue-500/15 text-blue-500'
              }`}
            >
              <AlertCircle className="w-5 h-5" />
            </div>

            <h3
              id="confirm-dialog-title"
              className="text-base font-extrabold tracking-tight mb-1.5"
              style={{ color: 'var(--text-main)' }}
            >
              {title}
            </h3>
            <p
              id="confirm-dialog-desc"
              className="text-xs opacity-70 leading-relaxed mb-4"
              style={{ color: 'var(--text-muted)' }}
            >
              {description}
            </p>

            {showServerToggle && (
              <div
                className="mb-5 p-3.5 rounded-2xl border text-left flex items-center justify-between gap-3 transition-colors"
                style={{
                  backgroundColor: 'var(--surface-primary)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex-1 min-w-0 pr-1">
                  <p className="text-xs font-bold leading-tight" style={{ color: 'var(--text-main)' }}>
                    {serverToggleLabel || 'Hapus di sisi server juga?'}
                  </p>
                  <p className="text-[11px] font-medium leading-normal mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {deleteFromServer
                      ? (serverToggleDescription || 'Berkas permanen dihapus dari server dan Catbox.')
                      : 'Berkas hanya dihapus dari sesi lokal Anda (tetap ada di server).'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={deleteFromServer}
                  onClick={() => onServerToggleChange?.(!deleteFromServer)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                    deleteFromServer
                      ? (isDestructive ? 'bg-rose-500' : 'bg-blue-600')
                      : 'bg-neutral-300 dark:bg-neutral-700'
                  }`}
                  aria-label={serverToggleLabel || 'Hapus di sisi server juga?'}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      deleteFromServer ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <button
                ref={cancelButtonRef}
                onClick={onCancel}
                disabled={isLoading}
                className="py-2.5 px-4 rounded-xl font-bold text-xs clean-interactive clean-tap border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
              >
                {cancelLabel}
              </button>
              <button
                ref={confirmButtonRef}
                onClick={onConfirm}
                disabled={isLoading}
                className={`py-2.5 px-4 rounded-xl font-bold text-xs transition-all clean-tap shadow-xs focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isDestructive
                    ? 'bg-rose-600 hover:bg-rose-700 text-white focus-visible:ring-rose-500'
                    : 'text-white focus-visible:ring-[var(--accent)]'
                }`}
                style={!isDestructive ? { backgroundColor: 'var(--accent)', color: 'var(--accent-text)' } : {}}
              >
                {isLoading ? 'Memproses...' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};


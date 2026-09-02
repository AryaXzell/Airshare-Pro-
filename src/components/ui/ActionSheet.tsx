import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Image, Video, Music, ChevronRight, X } from 'lucide-react';
import { MediaType } from '../../types';

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (type: MediaType | 'any') => void;
}

export const ActionSheet: React.FC<ActionSheetProps> = ({
  isOpen,
  onClose,
  onSelectType,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      triggerRef.current = document.activeElement as HTMLElement;
      // Focus first interactive item inside sheet
      const timer = setTimeout(() => {
        const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable && focusable.length > 0) {
          focusable[0].focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else {
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && sheetRef.current) {
        const focusables = Array.from(
          sheetRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute('disabled'));

        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="actionsheet-title"
        >
          {/* Static Blur Layer (Option A: instant blur mount without animated opacity to eliminate GPU jank) */}
          <div className="fixed inset-0 clean-backdrop-blur pointer-events-none" />

          {/* Animated Dark Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.15, ease: 'easeOut' }}
            onClick={onClose}
            className="fixed inset-0 clean-backdrop-overlay cursor-pointer"
          />

          {/* Sheet Container */}
          <motion.div
            ref={sheetRef}
            initial={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: 'easeOut' }}
            onAnimationComplete={() => setIsAnimating(false)}
            className="relative w-full max-w-md rounded-t-[2.2rem] sm:rounded-[2.2rem] p-5 sm:p-6 pb-8 z-10 border clean-surface-elevated overflow-hidden"
            style={{
              backgroundColor: 'var(--surface-elevated)',
              borderColor: 'var(--border-subtle)',
              willChange: isAnimating && !shouldReduceMotion ? 'transform, opacity' : 'auto',
            }}
          >
            {/* Grab handle for mobile */}
            <div
              className="w-10 h-1 rounded-full mx-auto mb-4 opacity-25"
              style={{ backgroundColor: 'var(--text-main)' }}
            />

            <div className="flex items-center justify-between mb-3.5">
              <p
                id="actionsheet-title"
                className="text-xs font-bold uppercase tracking-wider opacity-65"
                style={{ color: 'var(--text-muted)' }}
              >
                Pilih Tipe Media
              </p>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full clean-interactive opacity-60 hover:opacity-100 transition-opacity clean-tap"
                aria-label="Tutup menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  onSelectType('image');
                  onClose();
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all clean-interactive clean-tap text-left"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-xl bg-blue-500/15 text-blue-500">
                    <Image className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <span className="font-bold text-sm block" style={{ color: 'var(--text-main)' }}>
                      Perpustakaan Foto
                    </span>
                    <span className="text-xs opacity-60" style={{ color: 'var(--text-muted)' }}>
                      JPG, PNG, WebP, GIF, SVG
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 opacity-35" />
              </button>

              <button
                onClick={() => {
                  onSelectType('video');
                  onClose();
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all clean-interactive clean-tap text-left"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-500">
                    <Video className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <span className="font-bold text-sm block" style={{ color: 'var(--text-main)' }}>
                      Galeri Video
                    </span>
                    <span className="text-xs opacity-60" style={{ color: 'var(--text-muted)' }}>
                      MP4, WebM, MOV, MKV
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 opacity-35" />
              </button>

              <button
                onClick={() => {
                  onSelectType('audio');
                  onClose();
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all clean-interactive clean-tap text-left"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-xl bg-purple-500/15 text-purple-500">
                    <Music className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <span className="font-bold text-sm block" style={{ color: 'var(--text-main)' }}>
                      Berkas Audio & Musik
                    </span>
                    <span className="text-xs opacity-60" style={{ color: 'var(--text-muted)' }}>
                      MP3, WAV, FLAC, AAC, M4A
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 opacity-35" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

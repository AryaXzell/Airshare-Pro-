import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Eye, X } from 'lucide-react';
import { ImagePreview } from './ImagePreview';
import { CustomVideoPlayer } from '../video-player/CustomVideoPlayer';
import { CustomAudioPlayer } from '../audio-player/CustomAudioPlayer';
import { MediaItem } from '../../types';

interface MediaPreviewModalProps {
  item: MediaItem | null;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  item,
  onClose,
  onToast,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    if (item) {
      setIsAnimating(true);
      triggerRef.current = document.activeElement as HTMLElement;
      const timer = setTimeout(() => {
        const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
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
  }, [item]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!item) return;

      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
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
  }, [item, onClose]);

  const getImageModalWidth = () => {
    if (!item?.imageMeta?.width || !item?.imageMeta?.height) {
      return 'max-w-2xl';
    }
    const r = item.imageMeta.width / item.imageMeta.height;
    if (r < 0.7) return 'max-w-xs sm:max-w-sm'; // Tall vertical story/screenshot
    if (r < 0.9) return 'max-w-sm sm:max-w-md'; // Portrait 4:5
    if (r <= 1.2) return 'max-w-md sm:max-w-lg'; // Square 1:1
    if (r <= 1.8) return 'max-w-2xl sm:max-w-3xl'; // Landscape 4:3, 16:9
    return 'max-w-3xl sm:max-w-4xl lg:max-w-5xl'; // Ultra-wide / Panoramic
  };

  return (
    <AnimatePresence>
      {item && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={`Pratinjau media ${item.name}`}
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

          {/* Modal Card */}
          <motion.div
            ref={modalRef}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: 'easeOut' }}
            onAnimationComplete={() => setIsAnimating(false)}
            className="relative z-10 w-full flex items-center justify-center my-auto"
            style={{
              willChange: isAnimating && !shouldReduceMotion ? 'transform, opacity' : 'auto',
            }}
          >
            {item.type === 'video' ? (
              <CustomVideoPlayer item={item} onClose={onClose} onToast={onToast} />
            ) : item.type === 'audio' ? (
              <CustomAudioPlayer item={item} onClose={onClose} onToast={onToast} />
            ) : (
              <div
                className={`w-full ${getImageModalWidth()} bg-[#17171a] text-white rounded-[2rem] sm:rounded-[2.4rem] overflow-hidden shadow-2xl border border-white/10 flex flex-col relative transition-all duration-200`}
                style={{ zIndex: 10 }}
              >
                {/* Header */}
                <div className="p-3.5 sm:p-4 border-b border-white/10 flex items-center justify-between bg-[#1f1f24]">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Eye className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <span className="text-xs sm:text-sm font-bold truncate">
                      {item.name}
                    </span>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors clean-tap flex-shrink-0"
                    aria-label="Tutup pratinjau"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <ImagePreview item={item} onToast={onToast} />
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

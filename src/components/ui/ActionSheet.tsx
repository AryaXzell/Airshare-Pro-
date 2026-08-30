import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 clean-backdrop"
          />

          {/* Sheet Container */}
          <motion.div
            initial={{ y: '100%', opacity: 0.8 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full max-w-md rounded-t-[2.2rem] sm:rounded-[2.2rem] p-5 sm:p-6 pb-8 z-10 border clean-surface-elevated overflow-hidden"
            style={{
              backgroundColor: 'var(--surface-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {/* Grab handle for mobile */}
            <div
              className="w-10 h-1 rounded-full mx-auto mb-4 opacity-25"
              style={{ backgroundColor: 'var(--text-main)' }}
            />

            <div className="flex items-center justify-between mb-3.5">
              <p
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

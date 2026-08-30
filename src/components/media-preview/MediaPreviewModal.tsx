import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && item) {
        onClose();
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 clean-backdrop"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative z-10 w-full flex items-center justify-center my-auto"
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

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  Share2,
  Calendar,
  HardDrive,
  FileType,
  Cloud,
  Maximize2,
  Trash2,
  Music,
  Video,
  Image as ImageIcon,
} from 'lucide-react';
import { MediaItem } from '../../types';
import { copyToClipboard, formatDate } from '../../lib/utils';

interface MediaDetailModalProps {
  item: MediaItem | null;
  isOpen: boolean;
  onClose: () => void;
  onPreview: (item: MediaItem) => void;
  onDelete: (id: string) => void;
  onToast: (msg: string) => void;
}

export const MediaDetailModal: React.FC<MediaDetailModalProps> = ({
  item,
  isOpen,
  onClose,
  onPreview,
  onDelete,
  onToast,
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const handleCopyUrl = async () => {
    const ok = await copyToClipboard(item.shareUrl);
    if (ok) {
      setCopied(true);
      onToast('Tautan berhasil disalin!');
      setTimeout(() => setCopied(false), 2000);
    } else {
      onToast('Gagal menyalin tautan.');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.name,
          text: `Lihat berkas ${item.name} di AirShare Pro`,
          url: item.shareUrl,
        });
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') {
          handleCopyUrl();
        }
      }
    } else {
      handleCopyUrl();
    }
  };

  const getTypeIcon = () => {
    if (item.type === 'image') return <ImageIcon className="w-5 h-5" style={{ color: 'var(--accent)' }} />;
    if (item.type === 'video') return <Video className="w-5 h-5" style={{ color: 'var(--accent)' }} />;
    if (item.type === 'audio') return <Music className="w-5 h-5" style={{ color: 'var(--accent)' }} />;
    return <FileType className="w-5 h-5 opacity-60" />;
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 clean-backdrop"
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg rounded-[2rem] p-6 shadow-2xl z-10 overflow-hidden clean-surface border"
          style={{
            backgroundColor: 'var(--surface-primary)',
            borderColor: 'var(--border-subtle)',
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-title"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center space-x-3 overflow-hidden min-w-0 flex-1 pr-2">
              <div
                className="p-2.5 rounded-2xl flex items-center justify-center flex-shrink-0 border"
                style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}
              >
                {getTypeIcon()}
              </div>
              <div className="overflow-hidden min-w-0 flex-1">
                <h3
                  id="detail-title"
                  className="font-extrabold text-sm sm:text-base truncate"
                  style={{ color: 'var(--text-main)' }}
                  title={item.name}
                >
                  {item.name}
                </h3>
                <p className="text-xs font-semibold opacity-60 truncate font-mono" style={{ color: 'var(--text-muted)' }} title={`ID: ${item.id}`}>
                  ID: {item.id}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full clean-interactive clean-tap opacity-70 hover:opacity-100 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              aria-label="Tutup Detail"
              title="Tutup Detail"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 py-4 sm:py-5 text-xs">
            <div
              className="p-2.5 sm:p-3 rounded-2xl flex items-center space-x-2 sm:space-x-2.5 border min-w-0 overflow-hidden"
              style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}
            >
              <HardDrive className="w-4 h-4 opacity-50 flex-shrink-0" />
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-[10px] font-bold uppercase opacity-50 truncate">Ukuran</p>
                <p className="font-extrabold text-xs sm:text-sm truncate" style={{ color: 'var(--text-main)' }} title={item.formattedSize}>
                  {item.formattedSize}
                </p>
              </div>
            </div>

            <div
              className="p-2.5 sm:p-3 rounded-2xl flex items-center space-x-2 sm:space-x-2.5 border min-w-0 overflow-hidden"
              style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}
            >
              <Calendar className="w-4 h-4 opacity-50 flex-shrink-0" />
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-[10px] font-bold uppercase opacity-50 truncate">Diunggah</p>
                <p className="font-extrabold text-xs sm:text-sm truncate" style={{ color: 'var(--text-main)' }} title={formatDate(item.createdAt)}>
                  {formatDate(item.createdAt)}
                </p>
              </div>
            </div>

            <div
              className="p-2.5 sm:p-3 rounded-2xl flex items-center space-x-2 sm:space-x-2.5 border min-w-0 overflow-hidden"
              style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}
            >
              <FileType className="w-4 h-4 opacity-50 flex-shrink-0" />
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-[10px] font-bold uppercase opacity-50 truncate">MIME Type</p>
                <p className="font-extrabold text-xs sm:text-sm truncate" style={{ color: 'var(--text-main)' }} title={item.mimeType || item.type}>
                  {item.mimeType || item.type}
                </p>
              </div>
            </div>

            <div
              className="p-2.5 sm:p-3 rounded-2xl flex items-center space-x-2 sm:space-x-2.5 border min-w-0 overflow-hidden"
              style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}
            >
              <Cloud className="w-4 h-4 opacity-50 flex-shrink-0" />
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-[10px] font-bold uppercase opacity-50 truncate">Penyedia</p>
                <p className="font-extrabold text-xs sm:text-sm truncate" style={{ color: 'var(--text-main)' }} title="Catbox Storage">
                  Catbox Storage
                </p>
              </div>
            </div>
          </div>

          {/* Audio / Video Specific Metadata */}
          {item.audioMeta && (
            <div
              className="p-3.5 rounded-2xl mb-4 text-xs space-y-1.5 border min-w-0 overflow-hidden"
              style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}
            >
              <p className="text-[10px] font-extrabold uppercase opacity-50">Metadata ID3 Audio</p>
              {item.audioMeta.title && (
                <p className="font-bold truncate" title={item.audioMeta.title}>
                  <span className="opacity-50 font-normal">Judul: </span>
                  {item.audioMeta.title}
                </p>
              )}
              {item.audioMeta.artist && (
                <p className="font-bold truncate" title={item.audioMeta.artist}>
                  <span className="opacity-50 font-normal">Artis: </span>
                  {item.audioMeta.artist}
                </p>
              )}
              {item.audioMeta.album && (
                <p className="font-bold truncate" title={item.audioMeta.album}>
                  <span className="opacity-50 font-normal">Album: </span>
                  {item.audioMeta.album}
                </p>
              )}
            </div>
          )}

          {/* Public URL Container */}
          <div
            className="p-3 rounded-2xl mb-5 flex items-center justify-between space-x-2 border min-w-0 overflow-hidden"
            style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}
          >
            <p className="text-xs font-mono truncate min-w-0 flex-1 font-semibold" style={{ color: 'var(--accent)' }} title={item.shareUrl}>
              {item.shareUrl}
            </p>
            <button
              onClick={handleCopyUrl}
              className={`p-2 rounded-xl clean-interactive clean-tap flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                copied ? 'text-emerald-600 bg-emerald-500/15' : ''
              }`}
              style={!copied ? { color: 'var(--accent)' } : undefined}
              aria-label="Salin URL"
              title="Salin URL"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <button
              onClick={() => {
                onClose();
                onPreview(item);
              }}
              className="flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl text-xs font-bold clean-interactive clean-tap border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
              aria-label="Buka pratinjau berkas"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Pratinjau</span>
            </button>

            <a
              href={item.shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl text-xs font-bold clean-interactive clean-tap border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
              aria-label="Buka tautan asli di tab baru"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Buka Asli</span>
            </a>

            <button
              onClick={handleShare}
              className="flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl text-xs font-bold clean-interactive clean-tap border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
              aria-label="Bagikan berkas"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Bagikan</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onDelete(item.id);
              }}
              className="flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-500/10 clean-interactive clean-tap border border-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              aria-label="Hapus berkas dari riwayat"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

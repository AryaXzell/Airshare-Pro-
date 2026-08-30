import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Expand, Copy, Check, Trash2, Play, Music, Image as ImageIcon } from 'lucide-react';
import { MediaItem } from '../../types';
import { copyToClipboard, formatDate } from '../../lib/utils';

interface MediaCardProps {
  item: MediaItem;
  onPreview: (item: MediaItem) => void;
  onDelete: (id: string) => void;
  onToast: (msg: string) => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  item,
  onPreview,
  onDelete,
  onToast,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyToClipboard(item.shareUrl);
    if (ok) {
      setCopied(true);
      onToast('Tautan berhasil disalin!');
      setTimeout(() => setCopied(false), 2200);
    } else {
      onToast('Gagal menyalin tautan.');
    }
  };

  const renderThumbnail = () => {
    if (item.type === 'image') {
      return (
        <div
          className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl overflow-hidden flex-shrink-0 relative border"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface-secondary)' }}
        >
          <img
            src={item.blobUrl || item.shareUrl}
            alt={item.name}
            width={56}
            height={56}
            decoding="async"
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/></svg>';
            }}
          />
        </div>
      );
    }

    if (item.type === 'video') {
      return (
        <div
          className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-black relative overflow-hidden flex-shrink-0 flex items-center justify-center border shadow-xs"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <video
            src={item.blobUrl || item.shareUrl}
            className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none"
            preload="none"
            muted
            playsInline
          />
          <div className="w-6 h-6 rounded-full bg-white/30 flex items-center justify-center z-10 text-white shadow-xs">
            <Play className="w-3 h-3 fill-white translate-x-0.5" />
          </div>
        </div>
      );
    }

    if (item.type === 'audio') {
      if (item.audioMeta?.coverUrl) {
        return (
          <div
            className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl overflow-hidden flex-shrink-0 relative border"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <img
              src={item.audioMeta.coverUrl}
              alt="Album cover"
              width={56}
              height={56}
              decoding="async"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        );
      }

      return (
        <div
          className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-white shadow-xs border"
          style={{
            backgroundColor: 'var(--accent)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <Music className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: 'var(--accent-text)' }} />
        </div>
      );
    }

    return (
      <div
        className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center flex-shrink-0 border"
        style={{
          backgroundColor: 'var(--surface-secondary)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <ImageIcon className="w-5 h-5 opacity-40" />
      </div>
    );
  };

  const displayName =
    item.type === 'audio' && item.audioMeta?.title
      ? item.audioMeta.title
      : item.name;

  const subtitle =
    item.type === 'audio' && item.audioMeta?.artist
      ? item.audioMeta.artist
      : `${item.formattedSize} • ${formatDate(item.createdAt)}`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="clean-surface rounded-[1.6rem] sm:rounded-[1.8rem] p-3 sm:p-3.5 flex items-center justify-between space-x-3 transition-all group"
      style={{
        backgroundColor: 'var(--surface-primary)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div
        className="flex items-center space-x-3 overflow-hidden min-w-0 flex-grow cursor-pointer"
        onClick={() => onPreview(item)}
      >
        {renderThumbnail()}

        <div className="overflow-hidden min-w-0">
          <p className="font-extrabold text-xs sm:text-sm truncate leading-tight group-hover:text-blue-500 transition-colors" style={{ color: 'var(--text-main)' }}>
            {displayName}
          </p>
          <p className="text-[11px] font-semibold truncate mt-1" style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-1 sm:space-x-1.5 flex-shrink-0">
        <button
          onClick={() => onPreview(item)}
          className="p-2 sm:p-2.5 rounded-full clean-interactive clean-tap text-blue-500"
          title="Pratinjau Media"
          aria-label="Pratinjau Media"
        >
          <Expand className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        <button
          onClick={handleCopy}
          className={`p-2 sm:p-2.5 rounded-full clean-interactive clean-tap ${
            copied ? 'text-emerald-500 bg-emerald-500/15' : 'text-emerald-500'
          }`}
          title="Salin Tautan"
          aria-label="Salin Tautan"
        >
          {copied ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.id);
          }}
          className="p-2 sm:p-2.5 rounded-full clean-interactive clean-tap opacity-50 hover:opacity-100 hover:text-rose-500"
          title="Hapus dari Riwayat"
          aria-label="Hapus dari Riwayat"
        >
          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>
    </motion.div>
  );
};

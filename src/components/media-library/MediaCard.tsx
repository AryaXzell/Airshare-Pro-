import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Expand,
  Copy,
  Check,
  Trash2,
  Play,
  Music,
  Image as ImageIcon,
  Info,
  CheckSquare,
  Square,
  Share2,
} from 'lucide-react';
import { MediaItem, ViewMode } from '../../types';
import { copyToClipboard, formatDate, getPublicShareUrl } from '../../lib/utils';
import { shareSingleMedia, ToastFunction } from '../../lib/share-helper';

interface MediaCardProps {
  item: MediaItem;
  viewMode: ViewMode;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onPreview: (item: MediaItem) => void;
  onInspect: (item: MediaItem) => void;
  onDelete: (id: string) => void;
  onToast: ToastFunction;
}

const MediaCardComponent: React.FC<MediaCardProps> = ({
  item,
  viewMode,
  isSelected,
  onToggleSelect,
  onPreview,
  onInspect,
  onDelete,
  onToast,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const targetUrl = getPublicShareUrl(item);
    const ok = await copyToClipboard(targetUrl);
    if (ok) {
      setCopied(true);
      onToast('Tautan berhasil disalin!');
      setTimeout(() => setCopied(false), 2200);
    } else {
      onToast('Gagal menyalin tautan.', { type: 'error' });
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await shareSingleMedia(item, onToast);
  };

  const renderThumbnail = (isLargeGrid = false) => {
    const sizeClass = isLargeGrid
      ? 'w-full h-36 rounded-2xl'
      : 'w-13 h-13 sm:w-14 sm:h-14 rounded-2xl';

    if (item.type === 'image') {
      return (
        <div
          className={`${sizeClass} overflow-hidden flex-shrink-0 relative border`}
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface-secondary)' }}
        >
          <img
            src={item.blobUrl || item.shareUrl}
            alt={item.name}
            width={isLargeGrid ? 300 : 56}
            height={isLargeGrid ? 144 : 56}
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
          className={`${sizeClass} bg-black relative overflow-hidden flex-shrink-0 flex items-center justify-center border shadow-xs`}
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <video
            src={item.blobUrl || item.shareUrl}
            className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none"
            preload="none"
            muted
            playsInline
          />
          <div className="w-7 h-7 rounded-full bg-white/30 flex items-center justify-center z-10 text-white shadow-xs">
            <Play className="w-3.5 h-3.5 fill-white translate-x-0.5" />
          </div>
        </div>
      );
    }

    if (item.type === 'audio') {
      if (item.audioMeta?.coverUrl) {
        return (
          <div
            className={`${sizeClass} overflow-hidden flex-shrink-0 relative border`}
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <img
              src={item.audioMeta.coverUrl}
              alt="Album cover"
              width={isLargeGrid ? 300 : 56}
              height={isLargeGrid ? 144 : 56}
              decoding="async"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        );
      }

      return (
        <div
          className={`${sizeClass} flex items-center justify-center flex-shrink-0 text-white shadow-xs border`}
          style={{
            backgroundColor: 'var(--accent)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <Music className="w-6 h-6" style={{ color: 'var(--accent-text)' }} />
        </div>
      );
    }

    return (
      <div
        className={`${sizeClass} flex items-center justify-center flex-shrink-0 border`}
        style={{
          backgroundColor: 'var(--surface-secondary)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <ImageIcon className="w-6 h-6 opacity-40" />
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

  // ================= GRID VIEW =================
  if (viewMode === 'grid') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="media-card-grid clean-surface rounded-[1.8rem] p-3 flex flex-col justify-between transition-all group relative border"
        style={{
          backgroundColor: isSelected ? 'var(--surface-elevated)' : 'var(--surface-primary)',
          borderColor: isSelected ? 'var(--accent)' : 'var(--border-subtle)',
          boxShadow: isSelected ? '0 0 0 2px var(--accent)' : undefined,
        }}
      >
        {/* Selection Checkbox & Info trigger overlay */}
        <div className="absolute top-4 left-4 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(item.id);
            }}
            className={`p-1.5 rounded-xl transition-all clean-tap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
              isSelected
                ? 'text-white shadow-md'
                : 'bg-black/50 text-white/90 hover:bg-black/70 hover:text-white'
            }`}
            style={isSelected ? { backgroundColor: 'var(--accent)' } : undefined}
            aria-label={isSelected ? `Batalkan pilihan ${displayName}` : `Pilih ${displayName}`}
          >
            {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="cursor-pointer overflow-hidden" onClick={() => onPreview(item)}>
          {renderThumbnail(true)}

          <div className="pt-2.5 px-0.5 overflow-hidden">
            <p
              className="font-extrabold text-xs truncate leading-tight transition-colors"
              style={{ color: 'var(--text-main)' }}
              title={displayName}
            >
              {displayName}
            </p>
            <p className="text-[11px] font-semibold truncate mt-1" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          </div>
        </div>

        {/* Card Actions Bar */}
        <div className="flex items-center justify-between pt-2.5 mt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInspect(item);
            }}
            className="p-1.5 rounded-lg clean-interactive clean-tap opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            title="Detail Metadata"
            aria-label={`Detail metadata ${displayName}`}
          >
            <Info className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center space-x-1">
            <button
              onClick={handleShare}
              className="p-1.5 rounded-lg clean-interactive clean-tap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{ color: 'var(--accent)' }}
              title="Bagikan"
              aria-label={`Bagikan ${displayName}`}
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg clean-interactive clean-tap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              style={{
                color: copied ? '#059669' : 'var(--accent)',
                backgroundColor: copied ? 'rgba(16, 185, 129, 0.15)' : undefined,
              }}
              title="Salin Tautan"
              aria-label={`Salin tautan ${displayName}`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
              className="p-1.5 rounded-lg clean-interactive clean-tap opacity-60 hover:opacity-100 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              title="Hapus dari Riwayat"
              aria-label={`Hapus ${displayName} dari riwayat`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ================= LIST VIEW =================
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="media-card-list clean-surface rounded-[1.6rem] sm:rounded-[1.8rem] p-3 sm:p-3.5 flex items-center justify-between space-x-3 transition-all group border"
      style={{
        backgroundColor: isSelected ? 'var(--surface-elevated)' : 'var(--surface-primary)',
        borderColor: isSelected ? 'var(--accent)' : 'var(--border-subtle)',
        boxShadow: isSelected ? '0 0 0 2px var(--accent)' : undefined,
      }}
    >
      {/* Select Toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(item.id);
        }}
        className="p-1.5 rounded-xl clean-tap transition-all flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}
        aria-label={isSelected ? `Batalkan pilihan ${displayName}` : `Pilih ${displayName}`}
      >
        {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
      </button>

      {/* Main Info */}
      <div
        className="flex items-center space-x-3 overflow-hidden min-w-0 flex-grow cursor-pointer"
        onClick={() => onPreview(item)}
      >
        {renderThumbnail()}

        <div className="overflow-hidden min-w-0">
          <p
            className="font-extrabold text-xs sm:text-sm truncate leading-tight transition-colors"
            style={{ color: 'var(--text-main)' }}
          >
            {displayName}
          </p>
          <p className="text-[11px] font-semibold truncate mt-1" style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-1 sm:space-x-1.5 flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInspect(item);
          }}
          className="p-2 sm:p-2.5 rounded-full clean-interactive clean-tap opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          title="Detail Metadata"
          aria-label={`Detail metadata ${displayName}`}
        >
          <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        <button
          onClick={() => onPreview(item)}
          className="p-2 sm:p-2.5 rounded-full clean-interactive clean-tap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          style={{ color: 'var(--accent)' }}
          title="Pratinjau Media"
          aria-label={`Pratinjau ${displayName}`}
        >
          <Expand className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        <button
          onClick={handleCopy}
          className="p-2 sm:p-2.5 rounded-full clean-interactive clean-tap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          style={{
            color: copied ? '#059669' : 'var(--accent)',
            backgroundColor: copied ? 'rgba(16, 185, 129, 0.15)' : undefined,
          }}
          title="Salin Tautan"
          aria-label={`Salin tautan ${displayName}`}
        >
          {copied ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.id);
          }}
          className="p-2 sm:p-2.5 rounded-full clean-interactive clean-tap opacity-60 hover:opacity-100 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          title="Hapus dari Riwayat"
          aria-label={`Hapus ${displayName} dari riwayat`}
        >
          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>
    </motion.div>
  );
};

export const MediaCard = React.memo(MediaCardComponent);

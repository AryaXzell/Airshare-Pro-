import React, { useState } from 'react';
import {
  Download,
  Copy,
  Check,
  ExternalLink,
  Share2,
  FileText,
  Archive,
  FileCode,
  HardDrive,
  Calendar,
  Globe,
} from 'lucide-react';
import { MediaItem } from '../../types';
import { copyToClipboard, formatDate, getPublicShareUrl } from '../../lib/utils';
import { downloadMediaFile } from '../../lib/download-helper';
import { shareSingleMedia } from '../../lib/share-helper';

interface FilePreviewProps {
  item: MediaItem;
  onToast: (
    msg: string,
    options?: { description?: string; type?: 'success' | 'error' | 'warning' | 'info' }
  ) => void;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ item, onToast }) => {
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const ext = item.name.split('.').pop()?.toLowerCase() || '';
  const isArchive = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext);
  const isPdf = ext === 'pdf';
  const isDoc = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(ext);
  const isCode = ['json', 'xml', 'md'].includes(ext);

  const getFileBadgeColor = () => {
    if (isArchive) return { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.25)', text: '#f59e0b' };
    if (isPdf) return { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.25)', text: '#ef4444' };
    if (isDoc) return { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.25)', text: '#3b82f6' };
    if (isCode) return { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.25)', text: '#10b981' };
    return { bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.25)', text: '#6366f1' };
  };

  const badgeStyle = getFileBadgeColor();

  const handleCopy = async () => {
    const ok = await copyToClipboard(getPublicShareUrl(item));
    if (ok) {
      setCopied(true);
      onToast('Tautan berkas berhasil disalin!');
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadMediaFile(item.blobUrl || item.shareUrl, item.name);
      onToast('Unduhan berkas dimulai!');
    } catch {
      onToast('Gagal mengunduh berkas. Membuka di tab baru...', { type: 'warning' });
      window.open(item.shareUrl, '_blank');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShare = async () => {
    await shareSingleMedia(item, onToast);
  };

  return (
    <div className="p-6 sm:p-8 flex flex-col items-center text-center">
      {/* File Type Hero Icon */}
      <div
        className="w-20 h-20 sm:w-24 sm:h-24 rounded-[1.8rem] flex items-center justify-center border shadow-inner mb-5 relative group"
        style={{
          backgroundColor: badgeStyle.bg,
          borderColor: badgeStyle.border,
        }}
      >
        {isArchive ? (
          <Archive className="w-10 h-10 sm:w-12 sm:h-12" style={{ color: badgeStyle.text }} />
        ) : isCode ? (
          <FileCode className="w-10 h-10 sm:w-12 sm:h-12" style={{ color: badgeStyle.text }} />
        ) : (
          <FileText className="w-10 h-10 sm:w-12 sm:h-12" style={{ color: badgeStyle.text }} />
        )}

        <span
          className="absolute -bottom-2 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm border"
          style={{
            backgroundColor: '#1f1f24',
            borderColor: badgeStyle.border,
            color: badgeStyle.text,
          }}
        >
          {ext.toUpperCase() || 'FILE'}
        </span>
      </div>

      {/* File Name & Title */}
      <h3
        className="text-base sm:text-lg font-extrabold max-w-sm sm:max-w-md break-words leading-snug mb-2"
        style={{ color: '#ffffff' }}
        title={item.name}
      >
        {item.name}
      </h3>

      {/* Metadata Pill Row */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-6 text-xs text-white/70">
        <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
          <HardDrive className="w-3.5 h-3.5 opacity-60" />
          <span className="font-bold text-white/90">{item.formattedSize}</span>
        </span>

        <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
          <Calendar className="w-3.5 h-3.5 opacity-60" />
          <span>{formatDate(item.createdAt)}</span>
        </span>

        {item.uploaderCountryName && (
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
            {item.uploaderCountryCode ? (
              <img
                src={`/flags/${item.uploaderCountryCode.toLowerCase()}.svg`}
                alt={item.uploaderCountryName}
                className="w-4 h-3 object-cover rounded-xs"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <Globe className="w-3.5 h-3.5 opacity-60" />
            )}
            <span>{item.uploaderCountryName}</span>
          </span>
        )}
      </div>

      {/* Primary Download Button */}
      <div className="w-full max-w-xs space-y-2.5">
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="w-full py-3.5 px-6 rounded-2xl font-extrabold text-sm flex items-center justify-center space-x-2.5 shadow-lg transition-transform active:scale-[0.98] clean-tap"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-text)',
          }}
          aria-label={`Unduh ${item.name}`}
        >
          <Download className={`w-4 h-4 ${isDownloading ? 'animate-bounce' : ''}`} />
          <span>{isDownloading ? 'Menyiapkan...' : `Unduh Berkas (${item.formattedSize})`}</span>
        </button>

        {/* Secondary Action Grid */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            onClick={handleCopy}
            className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 transition-colors text-xs font-bold flex items-center justify-center space-x-1.5 text-white/90 clean-tap"
            title="Salin tautan share"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Disalin' : 'Salin'}</span>
          </button>

          <button
            onClick={handleShare}
            className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 transition-colors text-xs font-bold flex items-center justify-center space-x-1.5 text-white/90 clean-tap"
            title="Bagikan"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Bagikan</span>
          </button>

          <a
            href={item.shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 transition-colors text-xs font-bold flex items-center justify-center space-x-1.5 text-white/90 clean-tap"
            title="Buka link file langsung"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Buka</span>
          </a>
        </div>
      </div>
    </div>
  );
};

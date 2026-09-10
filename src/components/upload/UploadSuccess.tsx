import React, { useState } from 'react';
import { Sparkles, Link2, Copy, Check, Eye, PlusCircle, QrCode } from 'lucide-react';
import { MediaItem } from '../../types';
import { copyToClipboard, getPublicShareUrl } from '../../lib/utils';
import { QrCodeModal } from '../ui/QrCodeModal';

interface UploadSuccessProps {
  mediaItem: MediaItem;
  onPreview: (item: MediaItem) => void;
  onReset: () => void;
  onToast: (
    msg: string,
    options?: { description?: string; type?: 'success' | 'error' | 'warning' | 'info' }
  ) => void;
}

export const UploadSuccess: React.FC<UploadSuccessProps> = ({
  mediaItem,
  onPreview,
  onReset,
  onToast,
}) => {
  const [copied, setCopied] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  const displayUrl = getPublicShareUrl(mediaItem);

  const handleCopy = async () => {
    const success = await copyToClipboard(displayUrl);
    if (success) {
      setCopied(true);
      onToast('Tautan publik berhasil disalin ke papan klip!');
      setTimeout(() => setCopied(false), 2400);
    } else {
      onToast('Gagal menyalin tautan.');
    }
  };

  return (
    <div className="mt-5 space-y-3.5 pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }} role="region" aria-label="Hasil Unggahan Berhasil">
      {/* Success banner */}
      <div
        className="rounded-2xl p-3.5 sm:p-4 flex items-center space-x-3 text-xs font-semibold border"
        style={{
          backgroundColor: 'var(--accent-soft)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-main)',
        }}
      >
        <div
          className="p-2 rounded-xl flex-shrink-0 border shadow-xs"
          style={{
            backgroundColor: 'var(--surface-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        </div>
        <span className="leading-snug">Media berhasil diunggah dan tautan publik siap dibagikan!</span>
      </div>

      {/* Share Link Input, Copy & Mini QR Code */}
      <div className="flex items-center space-x-2">
        <div className="relative flex-grow min-w-0">
          <input
            type="text"
            readOnly
            value={displayUrl}
            className="w-full rounded-xl py-3 pl-3.5 pr-9 text-xs sm:text-sm font-mono clean-input"
            onClick={(e) => (e.target as HTMLInputElement).select()}
            aria-label="Tautan publik berkas"
          />
          <Link2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
        </div>

        <button
          onClick={handleCopy}
          className={`font-bold text-xs sm:text-sm px-3 sm:px-4 py-3 rounded-xl transition-all duration-150 clean-tap flex items-center space-x-1.5 shadow-xs flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
            copied ? 'bg-emerald-600 text-white' : ''
          }`}
          style={!copied ? { backgroundColor: 'var(--accent)', color: 'var(--accent-text)' } : {}}
          aria-label={copied ? 'Tautan telah disalin' : 'Salin tautan ke papan klip'}
          title="Salin Tautan"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span className="hidden sm:inline">{copied ? 'Disalin' : 'Salin'}</span>
        </button>

        {/* Mini QR Code Button (Static Generic Icon) */}
        <button
          onClick={() => setIsQrModalOpen(true)}
          className="p-3 rounded-xl border clean-surface-elevated hover:scale-105 transition-all duration-150 clean-tap flex-shrink-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] shadow-xs"
          style={{
            backgroundColor: 'var(--surface-primary)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-main)',
          }}
          title="Buka Kode QR"
          aria-label="Buka kode QR berkas"
        >
          <QrCode className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        </button>
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={() => onPreview(mediaItem)}
          className="flex items-center justify-center space-x-2 py-2.5 px-3.5 rounded-xl text-xs font-bold clean-interactive clean-tap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          style={{ color: 'var(--text-main)' }}
          aria-label={`Buka pratinjau ${mediaItem.name}`}
        >
          <Eye className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span>Pratinjau</span>
        </button>

        <button
          onClick={onReset}
          className="flex items-center justify-center space-x-2 py-2.5 px-3.5 rounded-xl text-xs font-bold clean-interactive clean-tap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          style={{ color: 'var(--text-main)' }}
          aria-label="Unggah berkas lain"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Unggah Baru</span>
        </button>
      </div>

      {/* Full QR Modal */}
      <QrCodeModal
        isOpen={isQrModalOpen}
        shareUrl={displayUrl}
        fileName={mediaItem.name}
        onClose={() => setIsQrModalOpen(false)}
        onToast={onToast}
      />
    </div>
  );
};


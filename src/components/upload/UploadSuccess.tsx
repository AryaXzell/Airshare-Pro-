import React, { useState } from 'react';
import { Sparkles, Link2, Copy, Check, Eye, PlusCircle } from 'lucide-react';
import { MediaItem } from '../../types';
import { copyToClipboard } from '../../lib/utils';

interface UploadSuccessProps {
  mediaItem: MediaItem;
  onPreview: (item: MediaItem) => void;
  onReset: () => void;
  onToast: (msg: string) => void;
}

export const UploadSuccess: React.FC<UploadSuccessProps> = ({
  mediaItem,
  onPreview,
  onReset,
  onToast,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(mediaItem.shareUrl);
    if (success) {
      setCopied(true);
      onToast('Tautan berhasil disalin!');
      setTimeout(() => setCopied(false), 2400);
    } else {
      onToast('Gagal menyalin tautan.');
    }
  };

  return (
    <div className="mt-5 space-y-3.5 pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
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
        <span>Media berhasil diunggah dan tautan publik siap dibagikan!</span>
      </div>

      {/* Share Link Input & Copy */}
      <div className="flex items-center space-x-2">
        <div className="relative flex-grow min-w-0">
          <input
            type="text"
            readOnly
            value={mediaItem.shareUrl}
            className="w-full rounded-xl py-3 pl-3.5 pr-9 text-xs sm:text-sm font-mono clean-input"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <Link2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
        </div>

        <button
          onClick={handleCopy}
          className={`font-bold text-xs sm:text-sm px-4 py-3 rounded-xl transition-all duration-150 clean-tap flex items-center space-x-1.5 shadow-xs flex-shrink-0 ${
            copied ? 'bg-emerald-600 text-white' : ''
          }`}
          style={!copied ? { backgroundColor: 'var(--accent)', color: 'var(--accent-text)' } : {}}
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Disalin' : 'Salin'}</span>
        </button>
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={() => onPreview(mediaItem)}
          className="flex items-center justify-center space-x-2 py-2.5 px-3.5 rounded-xl text-xs font-bold clean-interactive clean-tap"
          style={{ color: 'var(--text-main)' }}
        >
          <Eye className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span>Pratinjau</span>
        </button>

        <button
          onClick={onReset}
          className="flex items-center justify-center space-x-2 py-2.5 px-3.5 rounded-xl text-xs font-bold clean-interactive clean-tap"
          style={{ color: 'var(--text-main)' }}
        >
          <PlusCircle className="w-4 h-4" />
          <span>Unggah Baru</span>
        </button>
      </div>
    </div>
  );
};

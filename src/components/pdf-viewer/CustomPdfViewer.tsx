import React, { useState, useRef } from 'react';
import {
  FileText,
  X,
  Download,
  Copy,
  Check,
  ExternalLink,
  Maximize2,
  Minimize2,
  HardDrive,
  Calendar,
} from 'lucide-react';
import { MediaItem } from '../../types';
import { copyToClipboard, formatDate, getPublicShareUrl } from '../../lib/utils';
import { downloadMediaFile } from '../../lib/download-helper';

interface CustomPdfViewerProps {
  item: MediaItem;
  onClose: () => void;
  onToast: (
    msg: string,
    options?: { description?: string; type?: 'success' | 'error' | 'warning' | 'info' }
  ) => void;
}

export const CustomPdfViewer: React.FC<CustomPdfViewerProps> = ({
  item,
  onClose,
  onToast,
}) => {
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fileUrl = item.blobUrl || item.shareUrl;
  // Parameters to optimize native viewer presentation
  const viewerUrl = `${fileUrl}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`;

  const handleCopy = async () => {
    const ok = await copyToClipboard(getPublicShareUrl(item));
    if (ok) {
      setCopied(true);
      onToast('Tautan berkas PDF berhasil disalin!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadMediaFile(fileUrl, item.name);
      onToast('Unduhan PDF dimulai!');
    } catch {
      onToast('Gagal mengunduh berkas. Membuka di tab baru...', { type: 'warning' });
      window.open(item.shareUrl, '_blank');
    } finally {
      setIsDownloading(false);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {
        setIsFullscreen(!isFullscreen);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {
        setIsFullscreen(false);
      });
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`w-full ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'max-w-5xl rounded-[1.8rem] sm:rounded-[2.2rem]'
      } bg-[#17171a] text-white shadow-2xl border border-white/10 flex flex-col relative transition-all duration-200 overflow-hidden`}
      style={{
        height: isFullscreen ? '100vh' : 'min(86vh, 880px)',
        zIndex: 10,
      }}
    >
      {/* Header Bar */}
      <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-b border-white/10 flex items-center justify-between bg-[#1e1e24] flex-shrink-0">
        <div className="flex items-center space-x-3 min-w-0 pr-2">
          <div className="w-8 h-8 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center flex-shrink-0 text-red-500">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h2 className="text-xs sm:text-sm font-extrabold truncate max-w-[200px] sm:max-w-md" title={item.name}>
                {item.name}
              </h2>
              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/25 uppercase">
                PDF
              </span>
            </div>
            <div className="flex items-center space-x-3 text-[11px] text-white/50 mt-0.5">
              <span className="flex items-center space-x-1">
                <HardDrive className="w-3 h-3 opacity-60" />
                <span>{item.formattedSize}</span>
              </span>
              <span className="hidden sm:flex items-center space-x-1">
                <Calendar className="w-3 h-3 opacity-60" />
                <span>{formatDate(item.createdAt)}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
          <button
            onClick={handleCopy}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors clean-tap text-white/80 hover:text-white"
            title="Salin tautan berkas"
            aria-label="Salin tautan"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors clean-tap text-white/80 hover:text-white"
            title="Unduh berkas PDF"
            aria-label="Unduh PDF"
          >
            <Download className={`w-4 h-4 ${isDownloading ? 'animate-bounce' : ''}`} />
          </button>

          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors clean-tap text-white/80 hover:text-white"
            title="Buka di tab baru"
            aria-label="Buka di tab baru"
          >
            <ExternalLink className="w-4 h-4" />
          </a>

          <button
            onClick={toggleFullscreen}
            className="hidden sm:inline-flex p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors clean-tap text-white/80 hover:text-white"
            title={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
            aria-label="Layar penuh"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors clean-tap text-white"
            aria-label="Tutup pratinjau"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PDF Viewport */}
      <div className="relative flex-1 w-full h-full bg-[#121214] overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center space-y-3 bg-[#17171a] transition-opacity">
            <div className="w-9 h-9 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
            <p className="text-xs text-white/60 font-medium tracking-wide">
              Memuat pratinjau dokumen PDF...
            </p>
          </div>
        )}

        <iframe
          src={viewerUrl}
          title={`Pratinjau PDF: ${item.name}`}
          className="w-full h-full border-0"
          onLoad={() => setIsLoading(false)}
          onError={() => setIsLoading(false)}
        />
      </div>
    </div>
  );
};

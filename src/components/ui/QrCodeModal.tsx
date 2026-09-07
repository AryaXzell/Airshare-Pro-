import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { QrCode, Download, Copy, Check, Image as ImageIcon, X } from 'lucide-react';
import { copyToClipboard } from '../../lib/utils';
import { generateQrDataUrl } from '../../lib/qrcode-helper';

interface QrCodeModalProps {
  isOpen: boolean;
  shareUrl: string;
  fileName: string;
  onClose: () => void;
  onToast?: (
    msg: string,
    options?: { description?: string; type?: 'success' | 'error' | 'warning' | 'info' }
  ) => void;
}

// Module-level cache to prevent re-generating QR code for the same URL across opens
const qrCache = new Map<string, string>();

export const QrCodeModal: React.FC<QrCodeModalProps> = ({
  isOpen,
  shareUrl,
  fileName,
  onClose,
  onToast,
}) => {
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const copyLinkButtonRef = useRef<HTMLButtonElement>(null);
  const downloadButtonRef = useRef<HTMLButtonElement>(null);
  const copyImageButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const shouldReduceMotion = useReducedMotion();
  const [isAnimating, setIsAnimating] = useState(true);
  const [hasAnimationCompleted, setHasAnimationCompleted] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>(() => (shareUrl ? qrCache.get(shareUrl) || '' : ''));
  const [linkCopied, setLinkCopied] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);

  // Lazy QR generation: generate only when modal is open and not already in cache.
  // Delay generation until entrance animation completes to guarantee 0 FPS drop on entry.
  useEffect(() => {
    if (!isOpen) {
      setHasAnimationCompleted(false);
      return;
    }

    // If already in cache, load immediately
    const cached = qrCache.get(shareUrl);
    if (cached) {
      setQrDataUrl(cached);
      return;
    }

    // Reset displayed QR while loading
    setQrDataUrl('');

    // If motion is enabled, await entrance animation completion
    if (!hasAnimationCompleted && !shouldReduceMotion) {
      return;
    }

    let isMounted = true;
    generateQrDataUrl(shareUrl, 280)
      .then((dataUrl) => {
        if (!isMounted) return;
        qrCache.set(shareUrl, dataUrl);
        setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!isMounted) return;
        onToast?.('Gagal membuat kode QR.', { type: 'error' });
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, shareUrl, hasAnimationCompleted, shouldReduceMotion, onToast]);

  // Check browser support for copying image blobs to clipboard
  const canCopyImage =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.clipboard && typeof navigator.clipboard.write === 'function') &&
    typeof window !== 'undefined' &&
    typeof window.ClipboardItem !== 'undefined';

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      triggerElementRef.current = document.activeElement as HTMLElement | null;

      const timer = setTimeout(() => {
        copyLinkButtonRef.current?.focus();
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
          return;
        }

        // Focus Trap
        if (e.key === 'Tab') {
          const focusable = [
            closeButtonRef.current,
            downloadButtonRef.current,
            copyLinkButtonRef.current,
            canCopyImage ? copyImageButtonRef.current : null,
          ].filter(Boolean) as HTMLButtonElement[];

          if (focusable.length === 0) return;

          const firstEl = focusable[0];
          const lastEl = focusable[focusable.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === firstEl || !dialogRef.current?.contains(document.activeElement)) {
              e.preventDefault();
              lastEl.focus();
            }
          } else {
            if (document.activeElement === lastEl || !dialogRef.current?.contains(document.activeElement)) {
              e.preventDefault();
              firstEl.focus();
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', handleKeyDown);
        if (triggerElementRef.current && typeof triggerElementRef.current.focus === 'function') {
          triggerElementRef.current.focus();
        }
      };
    }
  }, [isOpen, onClose, canCopyImage]);

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const cleanBaseName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'airshare';
    const downloadLink = document.createElement('a');
    downloadLink.href = qrDataUrl;
    downloadLink.download = `qr-${cleanBaseName}.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const handleCopyQrImage = async () => {
    if (!qrDataUrl || !canCopyImage) return;
    try {
      const response = await fetch(qrDataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new window.ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      setImageCopied(true);
      setTimeout(() => setImageCopied(false), 2000);
    } catch {
      // Fallback: notify user and copy link text if image blob copy is blocked or unsupported
      onToast?.(
        'Penyalinan gambar tidak didukung di perangkat ini — tautan disalin sebagai gantinya.',
        {
          type: 'warning',
        }
      );
      handleCopyLink();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
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

          <motion.div
            ref={dialogRef}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 6 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 6 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.15, ease: 'easeOut' }}
            onAnimationComplete={() => {
              setIsAnimating(false);
              setHasAnimationCompleted(true);
            }}
            className="relative w-full max-w-sm rounded-[2rem] p-6 clean-surface-elevated z-10 border text-center"
            style={{
              backgroundColor: 'var(--surface-elevated)',
              borderColor: 'var(--border-subtle)',
              willChange: isAnimating && !shouldReduceMotion ? 'transform, opacity' : 'auto',
            }}
            role="dialog"
            aria-modal="true"
            aria-label={`Kode QR untuk ${fileName}`}
          >
            {/* Header with Close Button */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div
                  className="p-1.5 rounded-xl border"
                  style={{
                    backgroundColor: 'var(--surface-primary)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--accent)',
                  }}
                >
                  <QrCode className="w-4 h-4" />
                </div>
                <h3
                  className="text-sm font-extrabold tracking-tight truncate max-w-[200px]"
                  style={{ color: 'var(--text-main)' }}
                  title={fileName}
                >
                  Kode QR Media
                </h3>
              </div>

              <button
                ref={closeButtonRef}
                onClick={onClose}
                className="p-1.5 rounded-xl clean-interactive clean-tap opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                aria-label="Tutup modal kode QR"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* QR Code Container */}
            <div className="my-2 p-4 bg-white rounded-2xl border border-gray-200/80 shadow-inner flex flex-col items-center justify-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`Kode QR untuk ${fileName}`}
                  className="w-[240px] h-[240px] sm:w-[260px] sm:h-[260px] object-contain rounded-lg select-none"
                  draggable={false}
                />
              ) : (
                <div className="w-[240px] h-[240px] flex items-center justify-center text-xs text-gray-500 font-medium">
                  Membuat kode QR...
                </div>
              )}
            </div>

            {/* File Name & Share URL Display */}
            <div className="mt-3.5 mb-4 text-left">
              <p
                className="text-[11px] font-mono text-center truncate px-2 select-all rounded-lg py-1 border"
                style={{
                  backgroundColor: 'var(--surface-primary)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
                title={shareUrl}
              >
                {shareUrl}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-2">
              {/* Download QR PNG */}
              <button
                ref={downloadButtonRef}
                onClick={handleDownloadQr}
                disabled={!qrDataUrl}
                className={`py-2.5 px-2 rounded-xl font-bold text-xs clean-interactive clean-tap border flex flex-col items-center justify-center space-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  !qrDataUrl ? 'opacity-40 cursor-not-allowed' : ''
                }`}
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                title={qrDataUrl ? 'Unduh file gambar QR' : 'Menyiapkan kode QR...'}
                aria-label="Unduh gambar kode QR"
              >
                <Download className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span className="text-[11px]">Unduh QR</span>
              </button>

              {/* Copy URL */}
              <button
                ref={copyLinkButtonRef}
                onClick={handleCopyLink}
                className={`py-2.5 px-2 rounded-xl font-bold text-xs clean-interactive clean-tap border flex flex-col items-center justify-center space-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  linkCopied ? 'border-emerald-500 text-emerald-600 bg-emerald-500/10' : ''
                }`}
                style={!linkCopied ? { borderColor: 'var(--border-subtle)', color: 'var(--text-main)' } : {}}
                title="Salin Tautan Publik"
                aria-label="Salin tautan publik"
              >
                {linkCopied ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4 text-emerald-600" />
                )}
                <span className="text-[11px]">{linkCopied ? 'Tersalin' : 'Salin Link'}</span>
              </button>

              {/* Copy QR Image Blob */}
              {canCopyImage ? (
                <button
                  ref={copyImageButtonRef}
                  onClick={handleCopyQrImage}
                  disabled={!qrDataUrl}
                  className={`py-2.5 px-2 rounded-xl font-bold text-xs clean-interactive clean-tap border flex flex-col items-center justify-center space-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                    imageCopied ? 'border-emerald-500 text-emerald-600 bg-emerald-500/10' : ''
                  } ${!qrDataUrl ? 'opacity-40 cursor-not-allowed' : ''}`}
                  style={!imageCopied ? { borderColor: 'var(--border-subtle)', color: 'var(--text-main)' } : {}}
                  title={qrDataUrl ? 'Salin Gambar QR ke Clipboard' : 'Menyiapkan kode QR...'}
                  aria-label="Salin gambar kode QR ke clipboard"
                >
                  {imageCopied ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <ImageIcon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  )}
                  <span className="text-[11px]">{imageCopied ? 'Tersalin' : 'Salin QR'}</span>
                </button>
              ) : (
                <button
                  disabled
                  className="py-2.5 px-2 rounded-xl font-bold text-xs border opacity-40 cursor-not-allowed flex flex-col items-center justify-center space-y-1"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                  title="Browser tidak mendukung penyalinan gambar clipboard"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span className="text-[11px]">Salin QR</span>
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

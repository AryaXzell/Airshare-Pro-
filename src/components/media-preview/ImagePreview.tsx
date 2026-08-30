import React, { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Copy, Download, Check, Info } from 'lucide-react';
import { MediaItem } from '../../types';
import { copyToClipboard } from '../../lib/utils';

interface ImagePreviewProps {
  item: MediaItem;
  onToast: (msg: string) => void;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ item, onToast }) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [copied, setCopied] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(
    item.imageMeta?.width && item.imageMeta?.height
      ? { width: item.imageMeta.width, height: item.imageMeta.height }
      : null
  );

  const handleZoomIn = () => setZoom((prev) => Math.min(3.5, prev + 0.5));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.5, prev - 0.5));
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setDimensions({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    }
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(item.shareUrl);
    if (ok) {
      setCopied(true);
      onToast('Tautan gambar berhasil disalin!');
      setTimeout(() => setCopied(false), 2200);
    }
  };

  // Calculate formatted aspect ratio string
  const getRatioString = () => {
    if (!dimensions) return '';
    const { width, height } = dimensions;
    const r = width / height;
    if (Math.abs(r - 16 / 9) < 0.05) return '16:9';
    if (Math.abs(r - 9 / 16) < 0.05) return '9:16';
    if (Math.abs(r - 4 / 3) < 0.05) return '4:3';
    if (Math.abs(r - 3 / 4) < 0.05) return '3:4';
    if (Math.abs(r - 1) < 0.05) return '1:1';
    if (Math.abs(r - 21 / 9) < 0.08) return '21:9';
    return `${r.toFixed(2)}:1`;
  };

  const ratio = dimensions ? dimensions.width / dimensions.height : 1.33;
  const isPortrait = ratio < 0.85;

  return (
    <div className="flex flex-col w-full h-full transition-all duration-200">
      {/* Zoom / Rotate Toolbar */}
      <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 border-b border-white/10 bg-[#1f1f24] z-20">
        <div className="flex items-center space-x-1.5">
          <button
            onClick={handleZoomIn}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all clean-tap"
            title="Perbesar"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all clean-tap"
            title="Perkecil"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleRotate}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all clean-tap"
            title="Putar 90°"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          {(zoom !== 1 || rotation !== 0) && (
            <button
              onClick={handleReset}
              className="text-xs px-2.5 py-1.5 rounded-xl bg-white/15 text-white/80 hover:text-white font-semibold transition-all clean-tap"
            >
              Reset
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {dimensions && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/10 hidden sm:inline-block">
              {getRatioString()}
            </span>
          )}
          <div className="text-[11px] font-mono text-white/70 font-semibold">
            {Math.round(zoom * 100)}%
          </div>
        </div>
      </div>

      {/* Dynamic Image Stage Container */}
      <div
        className="flex-grow flex items-center justify-center p-2 sm:p-4 overflow-hidden relative bg-[#121215] transition-all duration-200"
        style={{
          minHeight: isPortrait ? '360px' : '260px',
          maxHeight: 'min(72vh, 800px)',
        }}
      >
        <img
          src={item.blobUrl || item.shareUrl}
          alt={item.name}
          onLoad={handleImageLoad}
          className="max-w-full max-h-[68vh] w-auto h-auto object-contain rounded-xl transition-transform duration-200 select-none shadow-2xl"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            cursor: zoom > 1 ? 'grab' : 'default',
          }}
          draggable={false}
        />
      </div>

      {/* Footer Info & Actions */}
      <div className="p-3.5 sm:p-4 border-t border-white/10 bg-[#1a1a1f] space-y-2.5 z-20">
        <div className="flex items-center justify-between text-xs text-gray-400 font-semibold px-1">
          <span className="flex items-center space-x-1.5 truncate">
            <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <span className="truncate">
              {dimensions
                ? `${dimensions.width} × ${dimensions.height} px • `
                : ''}
              {item.formattedSize}
            </span>
          </span>
          <span className="truncate max-w-[120px] text-right font-mono text-[11px] text-white/60">
            {item.mimeType}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleCopy}
            className={`flex items-center justify-center space-x-1.5 py-2.5 px-4 rounded-xl font-bold text-xs transition-all clean-tap ${
              copied ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Tautan Disalin!' : 'Salin Tautan'}</span>
          </button>

          <a
            href={item.blobUrl || item.shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={item.name}
            className="flex items-center justify-center space-x-1.5 py-2.5 px-4 rounded-xl font-bold text-xs bg-white/10 hover:bg-white/20 text-white transition-all clean-tap"
          >
            <Download className="w-4 h-4" />
            <span>Unduh Berkas</span>
          </a>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { motion } from 'motion/react';
import { Image, Video, Music, FileText, Zap, Clock, XCircle, Loader2 } from 'lucide-react';
import { formatBytes } from '../../lib/utils';

interface UploadProgressProps {
  file: File;
  percentage: number;
  speed: string;
  eta: string;
  statusMessage: string;
  onCancel: () => void;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({
  file,
  percentage,
  speed,
  eta,
  statusMessage,
  onCancel,
}) => {
  const getFileIcon = () => {
    if (file.type.startsWith('image/')) return <Image className="w-5 h-5" style={{ color: 'var(--accent)' }} />;
    if (file.type.startsWith('video/')) return <Video className="w-5 h-5" style={{ color: 'var(--accent)' }} />;
    if (file.type.startsWith('audio/')) return <Music className="w-5 h-5" style={{ color: 'var(--accent)' }} />;
    return <FileText className="w-5 h-5" style={{ color: 'var(--accent)' }} />;
  };

  const isProcessing = percentage >= 99 || statusMessage.toLowerCase().includes('memproses') || statusMessage.toLowerCase().includes('catbox');

  return (
    <div
      className="mt-4 space-y-3.5 rounded-2xl p-4 sm:p-5 border transition-all"
      style={{
        backgroundColor: 'var(--surface-secondary)',
        borderColor: 'var(--border-subtle)',
      }}
      role="region"
      aria-label="Progres Unggahan Berkas"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center space-x-3 overflow-hidden min-w-0">
          <div
            className="p-2.5 rounded-xl flex-shrink-0 flex items-center justify-center border"
            style={{
              backgroundColor: 'var(--surface-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {getFileIcon()}
          </div>
          <div className="overflow-hidden min-w-0">
            <p className="font-extrabold text-sm truncate" style={{ color: 'var(--text-main)' }}>
              {file.name}
            </p>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              {formatBytes(file.size)} • {isProcessing ? 'Memproses ke Catbox...' : 'Mengirim data...'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          <span
            className="text-xs font-extrabold px-2.5 py-1 rounded-full shadow-xs flex items-center space-x-1"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}
          >
            {isProcessing && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
            <span>{percentage}%</span>
          </span>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-full opacity-70 hover:opacity-100 hover:text-rose-500 transition-all clean-tap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            title="Batalkan Unggahan"
            aria-label="Batalkan Unggahan"
          >
            <XCircle className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>
        </div>
      </div>

      {/* Accessible Progress Bar */}
      <div
        className="w-full h-2.5 rounded-full overflow-hidden relative"
        style={{ backgroundColor: 'var(--slider-track)' }}
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progres unggahan ${file.name}`}
      >
        <motion.div
          className={`h-full rounded-full ${isProcessing ? 'animate-pulse' : ''}`}
          style={{ backgroundColor: 'var(--accent)' }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        />
      </div>

      {/* Speed & ETA stats */}
      <div
        className="grid grid-cols-2 gap-2 text-[11px] font-semibold pt-2 border-t"
        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
      >
        <div className="flex items-center space-x-1.5 truncate">
          <Zap className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
          <span className="truncate">
            Kecepatan: <span className="font-mono font-bold" style={{ color: 'var(--text-main)' }}>{speed}</span>
          </span>
        </div>
        <div className="flex items-center space-x-1.5 justify-end truncate">
          <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
          <span className="truncate">
            Sisa: <span className="font-mono font-bold" style={{ color: 'var(--text-main)' }}>{isProcessing ? 'Selesai...' : eta}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

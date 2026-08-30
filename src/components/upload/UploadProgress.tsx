import React from 'react';
import { motion } from 'motion/react';
import { Image, Video, Music, FileText, Zap, Clock, XCircle } from 'lucide-react';
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

  return (
    <div
      className="mt-4 space-y-3.5 rounded-2xl p-4 sm:p-5 border transition-all"
      style={{
        backgroundColor: 'var(--surface-secondary)',
        borderColor: 'var(--border-subtle)',
      }}
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
              {formatBytes(file.size)}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          <span
            className="text-xs font-extrabold px-2.5 py-1 rounded-full shadow-xs"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}
          >
            {percentage}%
          </span>
          <button
            onClick={onCancel}
            className="p-1 rounded-full opacity-60 hover:opacity-100 hover:text-rose-500 transition-all clean-tap"
            title="Batalkan Unggahan"
            aria-label="Batalkan Unggahan"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div
        className="w-full h-2 rounded-full overflow-hidden relative"
        style={{ backgroundColor: 'var(--slider-track)' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: 'var(--accent)' }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
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
            Sisa: <span className="font-mono font-bold" style={{ color: 'var(--text-main)' }}>{eta}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

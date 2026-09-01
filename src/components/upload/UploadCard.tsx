import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { UploadZone } from './UploadZone';
import { UploadProgress } from './UploadProgress';
import { UploadSuccess } from './UploadSuccess';
import { MediaItem } from '../../types';
import { UseUploadReturn } from '../../hooks/useUpload';

interface UploadCardProps {
  uploadState: UseUploadReturn;
  onRequestActionSheet: () => void;
  onPreviewItem: (item: MediaItem) => void;
  onToast: (msg: string) => void;
}

export const UploadCard: React.FC<UploadCardProps> = ({
  uploadState,
  onRequestActionSheet,
  onPreviewItem,
  onToast,
}) => {
  const {
    isUploading,
    progress,
    speed,
    eta,
    statusMessage,
    currentFile,
    lastFailedFile,
    result,
    error,
    startUpload,
    retryUpload,
    cancelUpload,
    resetUpload,
    dismissError,
  } = uploadState;

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const handleSpecificFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isUploading) {
      onToast('Proses unggahan lain sedang berjalan. Harap tunggu hingga selesai.');
      e.target.value = '';
      return;
    }
    if (e.target.files && e.target.files.length > 0) {
      startUpload(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleRetry = () => {
    retryUpload();
  };

  return (
    <div
      className="clean-surface rounded-[2rem] sm:rounded-[2.4rem] p-5 sm:p-7 transition-all duration-200 relative"
      style={{
        backgroundColor: 'var(--surface-primary)',
        borderColor: 'var(--border-subtle)',
        boxShadow: 'var(--shadow-subtle)',
      }}
    >
      {/* Hidden dedicated inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        disabled={isUploading}
        onChange={handleSpecificFileSelected}
        className="hidden"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        disabled={isUploading}
        onChange={handleSpecificFileSelected}
        className="hidden"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        disabled={isUploading}
        onChange={handleSpecificFileSelected}
        className="hidden"
      />

      {/* Main Upload Drag Zone */}
      <UploadZone
        onFileSelected={(file) => startUpload(file)}
        onRequestActionSheet={onRequestActionSheet}
        disabled={isUploading}
      />

      {/* Error Notice with Retry & Dismiss Recovery */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 p-3.5 sm:p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-semibold"
            role="alert"
          >
            <div className="flex items-start sm:items-center space-x-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 sm:mt-0" />
              <span className="leading-snug break-words">{error}</span>
            </div>

            <div className="flex items-center space-x-2 flex-shrink-0 self-end sm:self-auto">
              {(lastFailedFile || currentFile) && (
                <button
                  onClick={handleRetry}
                  className="px-3 py-1.5 rounded-xl bg-rose-500 text-white hover:bg-rose-600 transition-colors clean-tap flex items-center space-x-1.5 text-xs font-bold shadow-xs"
                  aria-label="Coba unggah lagi berkas yang gagal"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Coba Lagi</span>
                </button>
              )}
              <button
                onClick={dismissError}
                className="p-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 transition-colors clean-tap text-rose-600 dark:text-rose-400"
                aria-label="Tutup pesan kesalahan"
                title="Tutup"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Uploading Progress */}
      <AnimatePresence>
        {isUploading && currentFile && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <UploadProgress
              file={currentFile}
              percentage={progress}
              speed={speed}
              eta={eta}
              statusMessage={statusMessage}
              onCancel={cancelUpload}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Result */}
      <AnimatePresence>
        {result && !isUploading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <UploadSuccess
              mediaItem={result}
              onPreview={onPreviewItem}
              onReset={resetUpload}
              onToast={onToast}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
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
    result,
    error,
    startUpload,
    cancelUpload,
    resetUpload,
  } = uploadState;

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const handleSpecificFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      startUpload(e.target.files[0]);
      e.target.value = '';
    }
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
        onChange={handleSpecificFileSelected}
        className="hidden"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={handleSpecificFileSelected}
        className="hidden"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        onChange={handleSpecificFileSelected}
        className="hidden"
      />

      {/* Main Upload Drag Zone */}
      <UploadZone
        onFileSelected={(file) => startUpload(file)}
        onRequestActionSheet={onRequestActionSheet}
        disabled={isUploading}
      />

      {/* Error Notice */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center space-x-2.5 text-xs font-semibold"
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-grow">{error}</span>
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

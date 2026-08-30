import React, { useRef, useState } from 'react';
import { PlusCircle, UploadCloud, Image, Video, Music } from 'lucide-react';

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  onRequestActionSheet: () => void;
  disabled?: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  onFileSelected,
  onRequestActionSheet,
  disabled = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const genericInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      onFileSelected(file);
    }
  };

  const handleGenericFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      onFileSelected(file);
      e.target.value = '';
    }
  };

  return (
    <div className="w-full">
      <input
        ref={genericInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        onChange={handleGenericFileChange}
        className="hidden"
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (!disabled) onRequestActionSheet();
        }}
        className={`border-2 border-dashed rounded-[1.8rem] sm:rounded-[2.2rem] p-8 sm:p-11 flex flex-col items-center justify-center cursor-pointer group transition-all duration-200 relative overflow-hidden ${
          isDragOver
            ? 'scale-[1.008] border-solid'
            : 'hover:border-solid'
        }`}
        style={{
          borderColor: isDragOver ? 'var(--accent)' : 'var(--border-subtle)',
          backgroundColor: isDragOver ? 'var(--accent-soft)' : 'var(--surface-secondary)',
        }}
        role="button"
        tabIndex={0}
        aria-label="Mulai berbagi media. Klik atau seret file ke sini."
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onRequestActionSheet();
          }
        }}
      >
        <div
          className="p-4 sm:p-4.5 rounded-2xl mb-4 transition-transform duration-200 group-hover:scale-105 flex items-center justify-center border"
          style={{
            backgroundColor: 'var(--accent-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {isDragOver ? (
            <UploadCloud className="w-7 h-7 sm:w-8 sm:h-8" style={{ color: 'var(--accent)' }} />
          ) : (
            <PlusCircle className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.2]" style={{ color: 'var(--accent)' }} />
          )}
        </div>

        <h3 className="font-extrabold text-base sm:text-lg text-center tracking-tight" style={{ color: 'var(--text-main)' }}>
          {isDragOver ? 'Lepaskan berkas di sini' : 'Mulai Berbagi Media'}
        </h3>

        <p className="text-xs sm:text-sm mt-1.5 text-center font-medium max-w-xs sm:max-w-sm" style={{ color: 'var(--text-muted)' }}>
          Ketuk untuk memilih foto, video, atau audio dari perangkat Anda
        </p>

        <div
          className="flex items-center space-x-3.5 mt-5 pt-3.5 border-t w-full max-w-xs justify-center text-[11px] font-semibold"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
        >
          <span className="flex items-center space-x-1">
            <Image className="w-3.5 h-3.5" />
            <span>Foto</span>
          </span>
          <span className="opacity-40">•</span>
          <span className="flex items-center space-x-1">
            <Video className="w-3.5 h-3.5" />
            <span>Video</span>
          </span>
          <span className="opacity-40">•</span>
          <span className="flex items-center space-x-1">
            <Music className="w-3.5 h-3.5" />
            <span>Audio</span>
          </span>
        </div>
      </div>
    </div>
  );
};

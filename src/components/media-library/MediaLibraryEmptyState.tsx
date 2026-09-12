import React from 'react';
import { motion } from 'motion/react';
import { UploadCloud, Image, Music, Video, FileText } from 'lucide-react';
import { MediaLibraryEmptyIllustration } from './MediaLibraryEmptyIllustration';

interface MediaLibraryEmptyStateProps {
  onRequestUpload?: () => void;
}

export const MediaLibraryEmptyState: React.FC<MediaLibraryEmptyStateProps> = ({
  onRequestUpload,
}) => {
  const handleTriggerUpload = () => {
    if (onRequestUpload) {
      onRequestUpload();
      return;
    }
    // Fallback: smooth scroll to upload dropzone and focus or trigger
    const dropzone = document.getElementById('main-upload-dropzone');
    if (dropzone) {
      dropzone.scrollIntoView({ behavior: 'smooth', block: 'center' });
      dropzone.click();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <motion.div
      id="media-library-empty-state"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-[2rem] p-7 sm:p-10 border flex flex-col items-center justify-center text-center overflow-hidden transition-all duration-300"
      style={{
        backgroundColor: 'var(--surface-primary)',
        borderColor: 'var(--border-subtle)',
        boxShadow: 'var(--shadow-subtle)',
      }}
    >
      {/* Subtle top glass refraction hairline */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px] opacity-70"
        style={{
          background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
        }}
      />

      {/* Minimalist Clean Glass SVG Illustration */}
      <div className="mb-4 sm:mb-5">
        <MediaLibraryEmptyIllustration className="w-48 h-36 sm:w-56 sm:h-42" />
      </div>

      {/* Typography Hierarchy */}
      <h3
        id="empty-state-headline"
        className="text-base sm:text-lg font-extrabold tracking-tight mb-1.5"
        style={{ color: 'var(--text-main)' }}
      >
        Pustaka Media Masih Kosong
      </h3>

      <p
        id="empty-state-description"
        className="text-xs sm:text-[13px] font-medium max-w-sm leading-relaxed mb-6"
        style={{ color: 'var(--text-muted)' }}
      >
        Media yang Anda unggah akan otomatis tersimpan di sini lengkap dengan pratinjau instan,
        pemutar bawaan, dan tautan publik cepat.
      </p>

      {/* Action CTA Button */}
      <button
        type="button"
        id="btn-empty-state-upload"
        onClick={handleTriggerUpload}
        className="inline-flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white shadow-sm transition-all duration-200 active:scale-95 cursor-pointer hover:brightness-110 mb-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        style={{
          backgroundColor: 'var(--accent)',
        }}
        title="Buka pilihan media untuk mengunggah berkas"
      >
        <UploadCloud className="w-4 h-4" />
        <span>Unggah Berkas Sekarang</span>
      </button>

      {/* Clean Glass Format Pills Row */}
      <div className="pt-5 border-t border-[var(--border-subtle)] w-full max-w-md flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors"
          style={{
            backgroundColor: 'var(--surface-secondary)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <Image className="w-3.5 h-3.5 text-accent" />
          <span>Foto</span>
        </span>

        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors"
          style={{
            backgroundColor: 'var(--surface-secondary)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <Video className="w-3.5 h-3.5 text-accent" />
          <span>Video</span>
        </span>

        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors"
          style={{
            backgroundColor: 'var(--surface-secondary)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <Music className="w-3.5 h-3.5 text-accent" />
          <span>Audio</span>
        </span>

        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors"
          style={{
            backgroundColor: 'var(--surface-secondary)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <FileText className="w-3.5 h-3.5 text-accent" />
          <span>Dokumen</span>
        </span>
      </div>
    </motion.div>
  );
};

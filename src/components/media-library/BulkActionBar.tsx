import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckSquare, Square, Copy, Check, Trash2, Share2, X } from 'lucide-react';
import { copyToClipboard } from '../../lib/utils';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface BulkActionBarProps {
  selectedCount: number;
  totalVisibleCount: number;
  allVisibleSelected: boolean;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  getSelectedUrls: () => string[];
  onToast: (msg: string) => void;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  totalVisibleCount,
  allVisibleSelected,
  onSelectAllVisible,
  onClearSelection,
  onDeleteSelected,
  getSelectedUrls,
  onToast,
}) => {
  const [copied, setCopied] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (selectedCount === 0) return null;

  const handleCopyUrls = async () => {
    const urls = getSelectedUrls();
    if (urls.length === 0) return;
    const text = urls.join('\n');
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      onToast(`${urls.length} tautan disalin ke clipboard!`);
      setTimeout(() => setCopied(false), 2000);
    } else {
      onToast('Gagal menyalin tautan.');
    }
  };

  const handleShareUrls = async () => {
    const urls = getSelectedUrls();
    if (urls.length === 0) return;
    const text = urls.join('\n');

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${urls.length} Berkas AirShare Pro`,
          text: `Daftar berkas terunggah:\n${text}`,
        });
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') {
          handleCopyUrls();
        }
      }
    } else {
      handleCopyUrls();
    }
  };

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="fixed bottom-6 inset-x-4 sm:max-w-xl sm:mx-auto z-40 p-3.5 rounded-[1.8rem] shadow-2xl flex items-center justify-between space-x-3 border clean-surface backdrop-blur-md"
          style={{
            backgroundColor: 'var(--surface-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Select info & select all button */}
          <div className="flex items-center space-x-2">
            <button
              onClick={allVisibleSelected ? onClearSelection : onSelectAllVisible}
              className="p-1.5 rounded-xl clean-interactive clean-tap flex items-center space-x-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{ color: 'var(--accent)' }}
              aria-label={allVisibleSelected ? 'Batalkan pilih semua' : 'Pilih semua'}
            >
              {allVisibleSelected ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4 opacity-60" />
              )}
              <span className="hidden sm:inline">
                {allVisibleSelected ? 'Batal Semua' : `Pilih Semua (${totalVisibleCount})`}
              </span>
            </button>

            <span
              className="text-xs font-extrabold px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: 'var(--accent-soft)',
                color: 'var(--accent)',
              }}
            >
              {selectedCount} Terpilih
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-1 sm:space-x-1.5">
            {/* Copy bulk URLs */}
            <button
              onClick={handleCopyUrls}
              className={`p-2 sm:px-3 sm:py-2 rounded-xl clean-interactive clean-tap flex items-center space-x-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                copied ? 'text-emerald-600 bg-emerald-500/15' : 'text-emerald-600 dark:text-emerald-400'
              }`}
              title="Salin Semua URL Terpilih"
              aria-label="Salin Semua URL Terpilih"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Salin URL</span>
            </button>

            {/* Share bulk URLs */}
            <button
              onClick={handleShareUrls}
              className="p-2 sm:px-3 sm:py-2 rounded-xl clean-interactive clean-tap flex items-center space-x-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{ color: 'var(--accent)' }}
              title="Bagikan Tautan"
              aria-label="Bagikan Tautan"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Bagikan</span>
            </button>

            {/* Bulk Delete */}
            <button
              onClick={() => setShowConfirm(true)}
              className="p-2 sm:px-3 sm:py-2 rounded-xl clean-interactive clean-tap flex items-center space-x-1.5 text-xs font-bold text-rose-500 hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              title="Hapus Media Terpilih"
              aria-label="Hapus Media Terpilih"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Hapus</span>
            </button>

            {/* Close / clear selection */}
            <button
              onClick={onClearSelection}
              className="p-2 rounded-xl clean-interactive clean-tap opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              aria-label="Batalkan Pilihan"
              title="Batalkan Pilihan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      <ConfirmDialog
        isOpen={showConfirm}
        title={`Hapus ${selectedCount} Media Terpilih?`}
        description="Berkas yang dipilih akan dihapus dari daftar riwayat server aplikasi."
        confirmLabel={`Hapus ${selectedCount} Berkas`}
        cancelLabel="Batal"
        isDestructive={true}
        onConfirm={() => {
          onDeleteSelected();
          setShowConfirm(false);
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
};

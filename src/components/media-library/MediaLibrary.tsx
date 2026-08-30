import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FolderArchive, SearchX, Trash2 } from 'lucide-react';
import { MediaCard } from './MediaCard';
import { MediaFilter } from './MediaFilter';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { MediaItem, MediaType } from '../../types';

interface MediaLibraryProps {
  items: MediaItem[];
  filteredItems: MediaItem[];
  filter: 'all' | MediaType;
  onFilterChange: (filter: 'all' | MediaType) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onPreviewItem: (item: MediaItem) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
  onToast: (msg: string) => void;
}

export const MediaLibrary: React.FC<MediaLibraryProps> = ({
  items,
  filteredItems,
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  onPreviewItem,
  onDeleteItem,
  onClearAll,
  onToast,
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const handleConfirmClear = () => {
    onClearAll();
    setShowClearConfirm(false);
    onToast('Sesi riwayat media dibersihkan.');
  };

  const handleConfirmSingleDelete = () => {
    if (itemToDelete) {
      onDeleteItem(itemToDelete);
      setItemToDelete(null);
      onToast('Berkas dihapus dari riwayat.');
    }
  };

  return (
    <section className="mt-10 w-full">
      {/* Header section */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center space-x-2">
          <h2 className="text-base sm:text-lg font-extrabold tracking-tight" style={{ color: 'var(--text-main)' }}>
            Koleksi Media Lokal
          </h2>
          {items.length > 0 && (
            <span
              className="text-[11px] font-extrabold px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'var(--accent-soft)',
                color: 'var(--accent)',
              }}
            >
              {items.length}
            </span>
          )}
        </div>

        {items.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors clean-tap flex items-center space-x-1.5 px-2.5 py-1 rounded-lg clean-interactive"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Bersihkan Riwayat</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      {items.length > 0 && (
        <MediaFilter
          currentFilter={filter}
          onFilterChange={onFilterChange}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          totalCount={items.length}
        />
      )}

      {/* Empty State: No items uploaded yet */}
      {items.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[2rem] py-12 px-6 border-2 border-dashed flex flex-col items-center justify-center text-center transition-all"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--surface-secondary)',
          }}
        >
          <div
            className="p-3.5 rounded-2xl mb-3 flex items-center justify-center border"
            style={{
              backgroundColor: 'var(--surface-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <FolderArchive className="w-6 h-6 opacity-40" />
          </div>
          <h3 className="text-sm font-extrabold mb-1" style={{ color: 'var(--text-main)' }}>
            Belum Ada Media Terunggah
          </h3>
          <p className="text-xs font-medium max-w-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Media yang Anda unggah akan tersimpan di sesi lokal ini untuk kemudahan akses dan pratinjau instan.
          </p>
        </motion.div>
      )}

      {/* Empty State: Search/filter query matches nothing */}
      {items.length > 0 && filteredItems.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-[2rem] py-10 px-6 border border-dashed flex flex-col items-center justify-center text-center"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--surface-secondary)',
          }}
        >
          <SearchX className="w-6 h-6 opacity-40 mb-2" />
          <p className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
            Tidak ditemukan media yang cocok dengan filter atau pencarian.
          </p>
          <button
            onClick={() => {
              onFilterChange('all');
              onSearchChange('');
            }}
            className="mt-3 text-xs font-bold underline text-blue-500 clean-tap"
          >
            Reset Filter & Pencarian
          </button>
        </motion.div>
      )}

      {/* History Grid */}
      {filteredItems.length > 0 && (
        <motion.div layout className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <AnimatePresence>
            {filteredItems.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onPreview={onPreviewItem}
                onDelete={(id) => setItemToDelete(id)}
                onToast={onToast}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Confirm Clear All Dialog */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        title="Bersihkan Semua Riwayat?"
        description="Semua catatan riwayat berkas lokal akan dihapus. Berkas yang tersimpan di Catbox tetap dapat diakses via tautan aslinya."
        confirmLabel="Ya, Bersihkan"
        cancelLabel="Batal"
        isDestructive={true}
        onConfirm={handleConfirmClear}
        onCancel={() => setShowClearConfirm(false)}
      />

      {/* Confirm Single Delete Dialog */}
      <ConfirmDialog
        isOpen={itemToDelete !== null}
        title="Hapus Media dari Riwayat?"
        description="Tautan ini akan dihapus dari riwayat perangkat lokal Anda."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        isDestructive={true}
        onConfirm={handleConfirmSingleDelete}
        onCancel={() => setItemToDelete(null)}
      />
    </section>
  );
};

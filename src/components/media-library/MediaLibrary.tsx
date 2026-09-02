import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FolderArchive, SearchX, Trash2, ChevronDown, CheckSquare, Square } from 'lucide-react';
import { MediaCard } from './MediaCard';
import { MediaFilter } from './MediaFilter';
import { BulkActionBar } from './BulkActionBar';
import { MediaDetailModal } from './MediaDetailModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { MediaItem, MediaType, SortOption, ViewMode } from '../../types';

interface MediaLibraryProps {
  items: MediaItem[];
  filteredItems: MediaItem[];
  totalFilteredCount: number;
  hasMore: boolean;
  onLoadMore: () => void;
  filter: 'all' | MediaType;
  onFilterChange: (filter: 'all' | MediaType) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAllVisible: (ids: string[]) => void;
  onClearSelection: () => void;
  onPreviewItem: (item: MediaItem) => void;
  onDeleteItem: (id: string) => Promise<{ success: boolean }> | void;
  onDeleteMultiple: (ids: string[]) => Promise<{ succeeded: number; failed: number }> | void;
  onClearAll: () => Promise<{ succeeded: number; failed: number }> | void;
  onToast: (
    msg: string,
    options?: {
      description?: string;
      type?: 'success' | 'error' | 'warning' | 'info';
      duration?: number;
    }
  ) => void;
}

export const MediaLibrary: React.FC<MediaLibraryProps> = ({
  items,
  filteredItems,
  totalFilteredCount,
  hasMore,
  onLoadMore,
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
  selectedIds,
  onToggleSelect,
  onSelectAllVisible,
  onClearSelection,
  onPreviewItem,
  onDeleteItem,
  onDeleteMultiple,
  onClearAll,
  onToast,
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [inspectingItem, setInspectingItem] = useState<MediaItem | null>(null);

  const visibleIds = filteredItems.map((item) => item.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const handleConfirmClear = async () => {
    setShowClearConfirm(false);
    const result = await onClearAll();
    if (result && result.failed > 0 && result.succeeded === 0) {
      onToast('Gagal membersihkan riwayat dari server.', {
        type: 'error',
        description: 'Terjadi kesalahan saat menghubungi server. Silakan coba lagi.',
      });
    } else {
      onToast('Semua riwayat berkas dibersihkan dari server.', {
        type: 'success',
      });
    }
  };

  const handleConfirmSingleDelete = async () => {
    if (itemToDelete) {
      const id = itemToDelete;
      setItemToDelete(null);
      const result = await onDeleteItem(id);
      if (result && !result.success) {
        onToast('Gagal menghapus berkas dari server.', {
          type: 'error',
          description: 'Periksa koneksi internet Anda dan coba lagi.',
        });
      } else {
        onToast('Berkas berhasil dihapus dari riwayat.', {
          type: 'success',
        });
      }
    }
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const result = await onDeleteMultiple(ids);
    if (result) {
      if (result.failed === 0) {
        onToast(`${result.succeeded} berkas berhasil dihapus dari riwayat.`, {
          type: 'success',
        });
      } else if (result.succeeded > 0) {
        onToast(
          `${result.succeeded} berkas dihapus, tetapi ${result.failed} berkas gagal dihapus dari server.`,
          {
            type: 'warning',
            description: 'Item yang gagal tetap berada di daftar. Coba ulangi penghapusan.',
          }
        );
      } else {
        onToast(`Gagal menghapus ${result.failed} berkas dari server.`, {
          type: 'error',
          description: 'Periksa koneksi internet Anda dan coba lagi.',
        });
      }
    } else {
      onToast(`${ids.length} berkas dihapus dari riwayat.`);
    }
  };

  const getSelectedUrls = () => {
    return items
      .filter((item) => selectedIds.has(item.id))
      .map((item) => item.shareUrl);
  };

  return (
    <section className="mt-10 w-full" aria-label="Media Library">
      {/* Header section */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center space-x-2">
          <h2
            className="text-base sm:text-lg font-extrabold tracking-tight"
            style={{ color: 'var(--text-main)' }}
          >
            Koleksi Media
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
          <div className="flex items-center space-x-2">
            {/* Toggle Select All Visible */}
            <button
              onClick={() => {
                if (allVisibleSelected) {
                  onClearSelection();
                } else {
                  onSelectAllVisible(visibleIds);
                }
              }}
              className="text-xs font-bold transition-colors clean-tap flex items-center space-x-1 px-2.5 py-1 rounded-lg clean-interactive opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{ color: 'var(--text-main)' }}
              title={allVisibleSelected ? 'Batalkan pilihan semua' : 'Pilih semua terlihat'}
              aria-label={allVisibleSelected ? 'Batalkan pilihan semua media terlihat' : 'Pilih semua media terlihat'}
            >
              {allVisibleSelected ? (
                <CheckSquare className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {allVisibleSelected ? 'Batal Semua' : 'Pilih Semua'}
              </span>
            </button>

            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors clean-tap flex items-center space-x-1.5 px-2.5 py-1 rounded-lg clean-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              aria-label="Bersihkan semua riwayat media"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Bersihkan</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter, Sort, and Search Bar */}
      {items.length > 0 && (
        <MediaFilter
          currentFilter={filter}
          onFilterChange={onFilterChange}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          sortBy={sortBy}
          onSortChange={onSortChange}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
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
          <h3
            className="text-sm font-extrabold mb-1"
            style={{ color: 'var(--text-main)' }}
          >
            Belum Ada Media Terunggah
          </h3>
          <p
            className="text-xs font-medium max-w-xs leading-relaxed"
            style={{ color: 'var(--text-muted)' }}
          >
            Media yang Anda unggah akan tersimpan di pustaka ini untuk kemudahan
            akses, filter, dan pratinjau instan.
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
          <p
            className="text-xs font-semibold"
            style={{ color: 'var(--text-main)' }}
          >
            Tidak ditemukan media yang cocok dengan filter atau pencarian.
          </p>
          <button
            onClick={() => {
              onFilterChange('all');
              onSearchChange('');
            }}
            className="mt-3 text-xs font-bold underline clean-tap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            style={{ color: 'var(--accent)' }}
          >
            Reset Filter & Pencarian
          </button>
        </motion.div>
      )}

      {/* Media Collection (Grid or List Layout) */}
      {filteredItems.length > 0 && (
        <div className="space-y-4">
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-2 gap-3 sm:grid-cols-3'
                : 'grid grid-cols-1 gap-2.5 sm:grid-cols-2'
            }
          >
            <AnimatePresence>
              {filteredItems.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  viewMode={viewMode}
                  isSelected={selectedIds.has(item.id)}
                  onToggleSelect={onToggleSelect}
                  onPreview={onPreviewItem}
                  onInspect={(itm) => setInspectingItem(itm)}
                  onDelete={(id) => setItemToDelete(id)}
                  onToast={onToast}
                />
              ))}
            </AnimatePresence>
          </div>

          {/* Load More Pagination Button */}
          {hasMore && (
            <div className="flex flex-col items-center justify-center pt-3">
              <button
                onClick={onLoadMore}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-2xl text-xs font-extrabold clean-interactive clean-tap border shadow-xs"
                style={{
                  backgroundColor: 'var(--surface-primary)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-main)',
                }}
              >
                <span>Muat Lebih Banyak ({filteredItems.length} dari {totalFilteredCount})</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bulk Action Bar on Selection */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <BulkActionBar
            key="bulk-action-bar"
            selectedCount={selectedIds.size}
            totalVisibleCount={visibleIds.length}
            allVisibleSelected={allVisibleSelected}
            onSelectAllVisible={() => onSelectAllVisible(visibleIds)}
            onClearSelection={onClearSelection}
            onDeleteSelected={handleDeleteSelected}
            getSelectedUrls={getSelectedUrls}
            onToast={onToast}
          />
        )}
      </AnimatePresence>

      {/* Media Detail Metadata Modal */}
      <MediaDetailModal
        item={inspectingItem}
        isOpen={inspectingItem !== null}
        onClose={() => setInspectingItem(null)}
        onPreview={onPreviewItem}
        onDelete={(id) => {
          setInspectingItem(null);
          setItemToDelete(id);
        }}
        onToast={onToast}
      />

      {/* Confirm Clear All Dialog */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        title="Bersihkan Semua Riwayat?"
        description="Semua catatan riwayat berkas akan dihapus dari server aplikasi. Berkas yang tersimpan di Catbox tetap dapat diakses via tautan aslinya."
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
        description="Tautan ini akan dihapus dari riwayat server dan daftar media Anda."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        isDestructive={true}
        onConfirm={handleConfirmSingleDelete}
        onCancel={() => setItemToDelete(null)}
      />
    </section>
  );
};

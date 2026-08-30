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
  onDeleteItem: (id: string) => void;
  onDeleteMultiple: (ids: string[]) => void;
  onClearAll: () => void;
  onToast: (msg: string) => void;
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

  const handleDeleteSelected = () => {
    const ids = Array.from(selectedIds);
    onDeleteMultiple(ids);
    onToast(`${ids.length} berkas dihapus dari riwayat.`);
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
              className="text-xs font-bold transition-colors clean-tap flex items-center space-x-1 px-2.5 py-1 rounded-lg clean-interactive opacity-75 hover:opacity-100"
              style={{ color: 'var(--text-main)' }}
              title={allVisibleSelected ? 'Batalkan pilihan semua' : 'Pilih semua terlihat'}
            >
              {allVisibleSelected ? (
                <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {allVisibleSelected ? 'Batal Semua' : 'Pilih Semua'}
              </span>
            </button>

            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors clean-tap flex items-center space-x-1.5 px-2.5 py-1 rounded-lg clean-interactive"
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
            className="mt-3 text-xs font-bold underline text-blue-500 clean-tap"
          >
            Reset Filter & Pencarian
          </button>
        </motion.div>
      )}

      {/* Media Collection (Grid or List Layout) */}
      {filteredItems.length > 0 && (
        <div className="space-y-4">
          <motion.div
            layout
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
          </motion.div>

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
      <BulkActionBar
        selectedCount={selectedIds.size}
        totalVisibleCount={visibleIds.length}
        allVisibleSelected={allVisibleSelected}
        onSelectAllVisible={() => onSelectAllVisible(visibleIds)}
        onClearSelection={onClearSelection}
        onDeleteSelected={handleDeleteSelected}
        getSelectedUrls={getSelectedUrls}
        onToast={onToast}
      />

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

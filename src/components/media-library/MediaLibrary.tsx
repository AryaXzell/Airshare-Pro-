import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SearchX, Trash2, ChevronDown, CheckSquare, Square } from 'lucide-react';
import { MediaCard } from './MediaCard';
import { MediaFilter } from './MediaFilter';
import { BulkActionBar } from './BulkActionBar';
import { MediaDetailModal } from './MediaDetailModal';
import { MediaLibraryEmptyState } from './MediaLibraryEmptyState';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { MediaItem, MediaType, SortOption, ViewMode } from '../../types';
import { getPublicShareUrl } from '../../lib/utils';

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
  onDeleteItem: (id: string, options?: { deleteFromServer?: boolean }) => Promise<{ success: boolean; deletedFromServer?: boolean }> | void;
  onDeleteMultiple: (ids: string[], options?: { deleteFromServer?: boolean }) => Promise<{ succeeded: number; failed: number; deletedFromServer?: boolean }> | void;
  onClearAll: (options?: { deleteFromServer?: boolean }) => Promise<{ succeeded: number; failed: number; deletedFromServer?: boolean }> | void;
  onRequestUpload?: () => void;
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
  onRequestUpload,
  onToast,
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [inspectingItem, setInspectingItem] = useState<MediaItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFromServer, setDeleteFromServer] = useState(true);

  const visibleIds = filteredItems.map((item) => item.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const handleConfirmClear = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await onClearAll({ deleteFromServer });
      setShowClearConfirm(false);
      if (result && result.failed > 0 && result.succeeded === 0 && deleteFromServer) {
        onToast('Gagal membersihkan riwayat dari server.', {
          type: 'error',
          description: 'Terjadi kesalahan saat menghubungi server. Silakan coba lagi.',
        });
      } else {
        onToast(
          deleteFromServer
            ? 'Semua riwayat berkas dan penyimpanan dibersihkan dari server.'
            : 'Semua berkas dibersihkan dari sesi lokal (tetap tersimpan di server).',
          {
            type: 'success',
          }
        );
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmSingleDelete = async () => {
    if (!itemToDelete || isDeleting) return;
    const id = itemToDelete;
    setIsDeleting(true);
    try {
      const result = await onDeleteItem(id, { deleteFromServer });
      setItemToDelete(null);
      if (result && !result.success && deleteFromServer) {
        onToast('Gagal menghapus berkas dari server.', {
          type: 'error',
          description: 'Periksa koneksi internet Anda dan coba lagi.',
        });
      } else {
        onToast(
          deleteFromServer
            ? 'Berkas berhasil dihapus dari server dan riwayat.'
            : 'Berkas dihapus dari sesi lokal Anda (tetap ada di server).',
          {
            type: 'success',
          }
        );
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSelected = async (fromServer: boolean = deleteFromServer) => {
    if (isDeleting) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsDeleting(true);
    try {
      const result = await onDeleteMultiple(ids, { deleteFromServer: fromServer });
      if (result) {
        if (result.failed === 0) {
          onToast(
            fromServer
              ? `${result.succeeded} berkas berhasil dihapus dari server dan riwayat.`
              : `${result.succeeded} berkas dihapus dari sesi lokal Anda.`,
            {
              type: 'success',
            }
          );
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
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCloseDetail = React.useCallback(() => {
    setInspectingItem(null);
  }, []);

  const handleDeleteFromDetail = React.useCallback((id: string) => {
    setInspectingItem(null);
    setItemToDelete(id);
  }, []);

  const getSelectedUrls = () => {
    return items
      .filter((item) => selectedIds.has(item.id))
      .map((item) => getPublicShareUrl(item));
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
        <MediaLibraryEmptyState onRequestUpload={onRequestUpload} />
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
            key={viewMode}
            className={`relative ${
              viewMode === 'grid'
                ? 'grid grid-cols-2 gap-3 sm:grid-cols-3'
                : 'grid grid-cols-1 gap-2.5 sm:grid-cols-2'
            }`}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {filteredItems.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  viewMode={viewMode}
                  isSelected={selectedIds.has(item.id)}
                  onToggleSelect={onToggleSelect}
                  onPreview={onPreviewItem}
                  onInspect={setInspectingItem}
                  onDelete={setItemToDelete}
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
        onClose={handleCloseDetail}
        onPreview={onPreviewItem}
        onDelete={handleDeleteFromDetail}
        onToast={onToast}
      />

      {/* Confirm Clear All Dialog */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        title="Bersihkan Semua Riwayat?"
        description={
          deleteFromServer
            ? 'Semua catatan riwayat dan berkas akan dibersihkan permanen dari server aplikasi & Catbox.'
            : 'Semua berkas akan dibersihkan dari sesi lokal Anda (berkas tetap tersimpan di server).'
        }
        confirmLabel="Ya, Bersihkan"
        cancelLabel="Batal"
        isDestructive={true}
        isLoading={isDeleting}
        showServerToggle={true}
        serverToggleLabel="Hapus di sisi server juga?"
        serverToggleDescription="Hapus semua berkas dari server & Catbox."
        deleteFromServer={deleteFromServer}
        onServerToggleChange={setDeleteFromServer}
        onConfirm={handleConfirmClear}
        onCancel={() => !isDeleting && setShowClearConfirm(false)}
      />

      {/* Confirm Single Delete Dialog */}
      <ConfirmDialog
        isOpen={itemToDelete !== null}
        title="Hapus Media dari Riwayat?"
        description={
          deleteFromServer
            ? 'Tautan dan berkas akan dihapus permanen dari server dan penyimpanan Catbox.'
            : 'Tautan hanya akan dihapus dari sesi lokal Anda (tetap tersimpan di server).'
        }
        confirmLabel="Hapus"
        cancelLabel="Batal"
        isDestructive={true}
        isLoading={isDeleting}
        showServerToggle={true}
        serverToggleLabel="Hapus di sisi server juga?"
        serverToggleDescription="Hapus berkas dari server & Catbox."
        deleteFromServer={deleteFromServer}
        onServerToggleChange={setDeleteFromServer}
        onConfirm={handleConfirmSingleDelete}
        onCancel={() => !isDeleting && setItemToDelete(null)}
      />
    </section>
  );
};

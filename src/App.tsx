import React, { Suspense, lazy, useRef, useState } from 'react';
import { Header } from './components/header/Header';
import { UploadCard } from './components/upload/UploadCard';
import { MediaLibrary } from './components/media-library/MediaLibrary';
import { Toast } from './components/ui/Toast';
import { useTheme } from './hooks/useTheme';
import { useToast } from './hooks/useToast';
import { useMediaLibrary } from './hooks/useMediaLibrary';
import { useUpload } from './hooks/useUpload';
import { MediaItem, MediaType } from './types';

// Lazy-load non-critical interactive overlays to reduce initial bundle size & execution time
const MediaPreviewModal = lazy(() =>
  import('./components/media-preview/MediaPreviewModal').then((m) => ({
    default: m.MediaPreviewModal,
  }))
);

const ActionSheet = lazy(() =>
  import('./components/ui/ActionSheet').then((m) => ({
    default: m.ActionSheet,
  }))
);

export default function App() {
  const { theme, setTheme } = useTheme();
  const { toast, showToast, hideToast } = useToast();
  const {
    items,
    filteredItems,
    totalFilteredCount,
    hasMore,
    loadMore,
    addItem,
    removeItem,
    removeMultiple,
    clearAll,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    viewMode,
    setViewMode,
    selectedIds,
    toggleSelect,
    selectAllVisible,
    clearSelection,
  } = useMediaLibrary();

  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);

  // Hidden inputs for dedicated action sheet triggers
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const uploadState = useUpload((newItem) => {
    addItem(newItem);
    showToast('Media berhasil diunggah dan disimpan!', {
      description: newItem.name,
      type: 'success',
    });
  });

  const handleActionSheetSelect = (type: MediaType | 'any') => {
    setIsActionSheetOpen(false);
    // Trigger the appropriate file input
    setTimeout(() => {
      if (type === 'image') imageInputRef.current?.click();
      else if (type === 'video') videoInputRef.current?.click();
      else if (type === 'audio') audioInputRef.current?.click();
    }, 150);
  };

  const handleDedicatedFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      uploadState.startUpload(file);
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300">
      {/* Hidden File Inputs for Action Sheet */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleDedicatedFileSelected}
        className="hidden"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={handleDedicatedFileSelected}
        className="hidden"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        onChange={handleDedicatedFileSelected}
        className="hidden"
      />

      {/* Floating Header */}
      <Header
        currentTheme={theme}
        onSelectTheme={setTheme}
        mediaCount={items.length}
      />

      {/* Main App Content Container */}
      <main className="flex-grow max-w-2xl w-full mx-auto px-4 pt-7 pb-20">
        {/* Hero Title */}
        <div className="text-center mb-7 sm:mb-9 space-y-2">
          <h2
            className="text-4xl sm:text-5xl font-extrabold tracking-tight"
            style={{ color: 'var(--text-main)', letterSpacing: '-0.04em' }}
          >
            simpel. instan.
          </h2>
          <p
            className="text-xs sm:text-sm font-semibold opacity-75 max-w-md mx-auto leading-relaxed"
            style={{ color: 'var(--text-muted)' }}
          >
            unggah media apa saja, sistem memproses otomatis, bagikan link premium.
          </p>
        </div>

        {/* Upload Card */}
        <UploadCard
          uploadState={uploadState}
          onRequestActionSheet={() => setIsActionSheetOpen(true)}
          onPreviewItem={(item) => setPreviewItem(item)}
          onToast={showToast}
        />

        {/* Media History / Library */}
        <MediaLibrary
          items={items}
          filteredItems={filteredItems}
          totalFilteredCount={totalFilteredCount}
          hasMore={hasMore}
          onLoadMore={loadMore}
          filter={filter}
          onFilterChange={setFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          onSortChange={setSortBy}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onSelectAllVisible={selectAllVisible}
          onClearSelection={clearSelection}
          onPreviewItem={(item) => setPreviewItem(item)}
          onDeleteItem={removeItem}
          onDeleteMultiple={removeMultiple}
          onClearAll={clearAll}
          onToast={showToast}
        />
      </main>

      {/* Media Type Selection Action Sheet */}
      <Suspense fallback={null}>
        {isActionSheetOpen && (
          <ActionSheet
            isOpen={isActionSheetOpen}
            onClose={() => setIsActionSheetOpen(false)}
            onSelectType={handleActionSheetSelect}
          />
        )}
      </Suspense>

      {/* Universal Media Preview Modal */}
      <Suspense fallback={null}>
        {previewItem && (
          <MediaPreviewModal
            item={previewItem}
            onClose={() => setPreviewItem(null)}
            onToast={showToast}
          />
        )}
      </Suspense>

      {/* Modern Floating Toast Notification */}
      <Toast toast={toast} onClose={hideToast} />
    </div>
  );
}

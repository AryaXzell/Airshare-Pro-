import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Header } from './components/header/Header';
import { UploadCard } from './components/upload/UploadCard';
import { MediaLibrary } from './components/media-library/MediaLibrary';
import { Toast } from './components/ui/Toast';
import { AnnouncementBanner } from './components/announcement/AnnouncementBanner';
import { useTheme } from './hooks/useTheme';
import { useToast } from './hooks/useToast';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useMediaLibrary } from './hooks/useMediaLibrary';
import { useUpload } from './hooks/useUpload';
import { usePasteUpload } from './hooks/usePasteUpload';
import { useSystemStatus } from './hooks/useSystemStatus';
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
  const { toast, toasts, showToast, hideToast } = useToast();
  const { isOnline } = useOnlineStatus();
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
    refreshFromServer,
  } = useMediaLibrary();

  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);

  // Real-time system status & announcement synchronization
  const { announcement, maintenanceLevel, isDismissed, dismissAnnouncement, featureFlags } = useSystemStatus();

  // Connection status & persistent toast tracking
  const prevOnlineRef = useRef<boolean>(isOnline);
  const offlineToastIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Failsafe: If a server-rendered route (/s/:id or /admin) was served index.html
    // by an outdated browser cache or stale service worker, force a hard reload once to get the SSR response.
    const pathname = window.location.pathname;
    if (pathname.startsWith('/s/') || pathname.startsWith('/admin')) {
      const retryKey = `ssr_nav_${pathname}`;
      if (!sessionStorage.getItem(retryKey)) {
        sessionStorage.setItem(retryKey, '1');
        window.location.reload();
      }
    }
  }, []);

  useEffect(() => {
    // When device goes offline
    if (!isOnline) {
      if (!offlineToastIdRef.current) {
        const id = showToast('Anda sedang offline — beberapa fitur tidak tersedia', {
          type: 'warning',
          duration: 0, // Persistent until reconnected or dismissed
        });
        offlineToastIdRef.current = id;
      }
    } else {
      // When device comes back online after being offline
      if (offlineToastIdRef.current) {
        hideToast(offlineToastIdRef.current);
        offlineToastIdRef.current = null;
      }
      if (!prevOnlineRef.current) {
        showToast('Koneksi kembali tersambung', {
          type: 'success',
          duration: 3500,
        });
        // Auto-refetch fresh data from server upon reconnection (online-first)
        refreshFromServer();
      }
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, showToast, hideToast, refreshFromServer]);

  // Hidden inputs for dedicated action sheet triggers
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadSuccess = React.useCallback(
    (newItem: MediaItem) => {
      addItem(newItem);
      showToast('Media berhasil diunggah dan disimpan!', {
        description: newItem.name,
        type: 'success',
      });
    },
    [addItem, showToast]
  );

  const uploadState = useUpload(handleUploadSuccess, showToast);
  const { startUpload, isUploading: isStateUploading } = uploadState;

  // Stable callback for paste upload with source: 'paste'
  const handlePastedFile = React.useCallback(
    (file: File) => {
      startUpload(file, { source: 'paste' });
    },
    [startUpload]
  );

  // Enable clipboard paste-to-upload (Ctrl+V / Cmd+V anywhere on the page)
  usePasteUpload({
    isEnabled:
      isOnline &&
      !isStateUploading &&
      featureFlags.pasteToUpload &&
      maintenanceLevel === 'off',
    onFilePasted: handlePastedFile,
  });

  const handleRequestActionSheet = React.useCallback(() => {
    if (maintenanceLevel === 'full_lockdown') {
      showToast('Website sedang dalam mode lockdown total untuk pemeliharaan sistem.', {
        type: 'error',
      });
      return;
    }
    if (maintenanceLevel === 'upload_only') {
      showToast('Layanan unggah berkas sedang dinonaktifkan sementara oleh administrator.', {
        type: 'warning',
      });
      return;
    }
    setIsActionSheetOpen(true);
  }, [maintenanceLevel, showToast]);

  const handleCloseActionSheet = React.useCallback(() => {
    setIsActionSheetOpen(false);
  }, []);

  const handleClosePreview = React.useCallback(() => {
    setPreviewItem(null);
  }, []);

  const handleActionSheetSelect = React.useCallback(
    (type: MediaType | 'any') => {
      setIsActionSheetOpen(false);
      if (maintenanceLevel === 'full_lockdown') {
        showToast('Website sedang dalam mode lockdown total untuk pemeliharaan sistem.', {
          type: 'error',
        });
        return;
      }
      if (maintenanceLevel === 'upload_only') {
        showToast('Layanan unggah berkas sedang dinonaktifkan sementara.', {
          type: 'warning',
        });
        return;
      }
      if (!isOnline) {
        showToast('Anda sedang offline. Hubungkan perangkat ke internet untuk mengunggah.', {
          type: 'warning',
        });
        return;
      }
      // Trigger the appropriate file input
      setTimeout(() => {
        if (type === 'image') imageInputRef.current?.click();
        else if (type === 'video') videoInputRef.current?.click();
        else if (type === 'audio') audioInputRef.current?.click();
        else if (type === 'file') fileInputRef.current?.click();
      }, 150);
    },
    [isOnline, maintenanceLevel, showToast]
  );

  const handleDedicatedFileSelected = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (maintenanceLevel !== 'off') {
        showToast(
          maintenanceLevel === 'full_lockdown'
            ? 'Website sedang dalam mode lockdown total untuk pemeliharaan sistem.'
            : 'Layanan unggah berkas sedang dinonaktifkan sementara.',
          { type: 'warning' }
        );
        e.target.value = '';
        return;
      }
      if (!isOnline) {
        showToast('Anda sedang offline. Hubungkan perangkat ke internet untuk mengunggah.', {
          type: 'warning',
        });
        e.target.value = '';
        return;
      }
      if (isStateUploading) {
        showToast('Proses unggahan lain sedang berjalan. Harap tunggu hingga selesai.', {
          type: 'warning',
        });
        e.target.value = '';
        return;
      }
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        startUpload(file);
        e.target.value = '';
      }
    },
    [isOnline, isStateUploading, maintenanceLevel, showToast, startUpload]
  );

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300">
      {/* Hidden File Inputs for Action Sheet */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        disabled={uploadState.isUploading || !isOnline || maintenanceLevel !== 'off'}
        onChange={handleDedicatedFileSelected}
        className="hidden"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        disabled={uploadState.isUploading || !isOnline || maintenanceLevel !== 'off'}
        onChange={handleDedicatedFileSelected}
        className="hidden"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        disabled={uploadState.isUploading || !isOnline || maintenanceLevel !== 'off'}
        onChange={handleDedicatedFileSelected}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.rar,.7z,.tar,.gz,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,application/zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.*"
        disabled={uploadState.isUploading || !isOnline || maintenanceLevel !== 'off'}
        onChange={handleDedicatedFileSelected}
        className="hidden"
      />

      {/* Floating Header */}
      <Header
        currentTheme={theme}
        onSelectTheme={setTheme}
        mediaCount={items.length}
        onToast={showToast}
      />

      {/* Main App Content Container */}
      <main className="flex-grow max-w-2xl w-full mx-auto px-4 pt-7 pb-20">
        {/* Real-time System Announcement Banner (with iOS stacked card support) */}
        <AnnouncementBanner
          maintenanceLevel={maintenanceLevel}
          announcement={announcement}
          isDismissed={isDismissed}
          onDismiss={dismissAnnouncement}
        />

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
          onRequestActionSheet={handleRequestActionSheet}
          onPreviewItem={setPreviewItem}
          onToast={showToast}
          isOnline={isOnline}
          maintenanceLevel={maintenanceLevel}
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
          onPreviewItem={setPreviewItem}
          onDeleteItem={removeItem}
          onDeleteMultiple={removeMultiple}
          onClearAll={clearAll}
          onRequestUpload={handleRequestActionSheet}
          onToast={showToast}
        />
      </main>

      {/* Media Type Selection Action Sheet */}
      <Suspense fallback={null}>
        {isActionSheetOpen && (
          <ActionSheet
            isOpen={isActionSheetOpen}
            onClose={handleCloseActionSheet}
            onSelectType={handleActionSheetSelect}
          />
        )}
      </Suspense>

      {/* Universal Media Preview Modal */}
      <Suspense fallback={null}>
        {previewItem && (
          <MediaPreviewModal
            item={previewItem}
            onClose={handleClosePreview}
            onToast={showToast}
          />
        )}
      </Suspense>

      {/* Modern Floating Toast Notification Stack */}
      <Toast toasts={toasts} toast={toast} onClose={hideToast} />
    </div>
  );
}


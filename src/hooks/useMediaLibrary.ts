import { useCallback, useEffect, useMemo, useState } from 'react';
import { MediaItem, MediaType, SortOption, ViewMode } from '../types';
import { mediaApiClient } from '../lib/api/mediaClient';

const STORAGE_KEY = 'airshare_media_history';
const VIEW_MODE_KEY = 'airshare_view_mode';
const PAGE_SIZE = 12;

export function useMediaLibrary() {
  const [items, setItems] = useState<MediaItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: MediaItem[] = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      console.warn('Failed to load media history from storage:', e);
    }
    return [];
  });

  const [filter, setFilter] = useState<'all' | MediaType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'list';
    return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'list';
  });
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoadingServer, setIsLoadingServer] = useState(false);

  // Debounce search input (300ms) to avoid expensive re-computations or network churn
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset page on query change
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Persist view mode preference
  const updateViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // ignore
    }
  }, []);

  // Refresh data from server on reconnect or manual trigger
  const refreshFromServer = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }
    try {
      setIsLoadingServer(true);
      const serverList = await mediaApiClient.fetchList();
      setItems((prev) => {
        const mergedMap = new Map<string, MediaItem>();
        prev.forEach((local) => {
          mergedMap.set(local.id, local);
        });
        serverList.forEach((server) => {
          const existing = mergedMap.get(server.id);
          if (existing) {
            mergedMap.set(server.id, {
              ...server,
              blobUrl: existing.blobUrl || server.shareUrl,
            });
          } else {
            mergedMap.set(server.id, {
              ...server,
              blobUrl: server.shareUrl,
            });
          }
        });
        const result = Array.from(mergedMap.values());
        result.sort((a, b) => b.createdAt - a.createdAt);
        return result;
      });
    } catch (err) {
      console.warn('Could not refresh media library with server:', err);
    } finally {
      setIsLoadingServer(false);
    }
  }, []);

  // Sync initial state from server repository on mount
  useEffect(() => {
    let isMounted = true;
    async function syncFromServer() {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }
      try {
        setIsLoadingServer(true);
        const serverList = await mediaApiClient.fetchList();
        if (!isMounted) return;

        setItems((prev) => {
          const mergedMap = new Map<string, MediaItem>();

          // Add local items
          prev.forEach((local) => {
            mergedMap.set(local.id, local);
          });

          // Overlay server items
          serverList.forEach((server) => {
            const existing = mergedMap.get(server.id);
            if (existing) {
              mergedMap.set(server.id, {
                ...server,
                blobUrl: existing.blobUrl || server.shareUrl,
              });
            } else {
              mergedMap.set(server.id, {
                ...server,
                blobUrl: server.shareUrl,
              });
            }
          });

          const result = Array.from(mergedMap.values());
          result.sort((a, b) => b.createdAt - a.createdAt);
          return result;
        });
      } catch (err) {
        console.warn('Could not sync media library with server:', err);
      } finally {
        if (isMounted) setIsLoadingServer(false);
      }
    }

    syncFromServer();
    return () => {
      isMounted = false;
    };
  }, []);

  // Persist items to local storage (omitting ephemeral blob URLs)
  useEffect(() => {
    try {
      const sanitized = items.map((item) => ({
        ...item,
        blobUrl: undefined,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    } catch (e) {
      console.warn('Failed to save media history to storage:', e);
    }
  }, [items]);

  const addItem = useCallback((item: MediaItem) => {
    setItems((prev) => [item, ...prev.filter((i) => i.id !== item.id)]);
    setPage(1);
  }, []);

  const removeItem = useCallback(async (id: string): Promise<{ success: boolean }> => {
    // Delete from server repository
    let success = false;
    try {
      await mediaApiClient.deleteMedia(id);
      success = true;
    } catch (err) {
      console.warn(`Failed to delete media ${id} on server:`, err);
    }

    // Revoke object URL and clean state if deletion succeeded or locally removed
    if (success) {
      setItems((prev) => {
        const target = prev.find((i) => i.id === id);
        if (target?.blobUrl && target.blobUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(target.blobUrl);
          } catch {
            // ignore
          }
        }
        return prev.filter((i) => i.id !== id);
      });

      // Remove from selection
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }

    return { success };
  }, []);

  const removeMultiple = useCallback(
    async (ids: string[]): Promise<{ succeeded: number; failed: number }> => {
      let succeeded = 0;
      let failed = 0;
      const successfulIds: string[] = [];

      // Execute server deletions and track per-item outcome
      for (const id of ids) {
        try {
          await mediaApiClient.deleteMedia(id);
          succeeded++;
          successfulIds.push(id);
        } catch (err) {
          failed++;
          console.warn(`Failed to delete media ${id}:`, err);
        }
      }

      if (successfulIds.length > 0) {
        const idSet = new Set(successfulIds);
        setItems((prev) => {
          prev.forEach((item) => {
            if (idSet.has(item.id) && item.blobUrl && item.blobUrl.startsWith('blob:')) {
              try {
                URL.revokeObjectURL(item.blobUrl);
              } catch {
                // ignore
              }
            }
          });
          return prev.filter((i) => !idSet.has(i.id));
        });

        // Unselect only the successfully deleted items
        setSelectedIds((prev) => {
          const next = new Set(prev);
          successfulIds.forEach((id) => next.delete(id));
          return next;
        });
      }

      return { succeeded, failed };
    },
    []
  );

  const clearAll = useCallback(async (): Promise<{ succeeded: number; failed: number }> => {
    let succeeded = 0;
    let failed = 0;

    try {
      await mediaApiClient.clearAll();
      succeeded = items.length;

      setItems((prev) => {
        prev.forEach((item) => {
          if (item.blobUrl && item.blobUrl.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(item.blobUrl);
            } catch {
              // ignore
            }
          }
        });
        return [];
      });

      setSelectedIds(new Set());
    } catch (err) {
      failed = items.length || 1;
      console.warn('Failed to clear all media on server:', err);
    }

    return { succeeded, failed };
  }, [items.length]);

  // Multi-selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAllVisible = useCallback((visibleIds: string[]) => {
    setSelectedIds(new Set(visibleIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Filter & Search
  const filteredAndSortedItems = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();

    const filtered = items.filter((item) => {
      const matchesType = filter === 'all' || item.type === filter;
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.originalFileName.toLowerCase().includes(q) ||
        item.audioMeta?.title?.toLowerCase().includes(q) ||
        item.audioMeta?.artist?.toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });

    // Deterministic Sorting
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return b.createdAt - a.createdAt;
        case 'oldest':
          return a.createdAt - b.createdAt;
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'size_desc':
          return b.size - a.size;
        case 'size_asc':
          return a.size - b.size;
        default:
          return b.createdAt - a.createdAt;
      }
    });
  }, [items, filter, debouncedSearch, sortBy]);

  // Paginated/Incrementally Loaded Slice for DOM Performance
  const paginatedItems = useMemo(() => {
    return filteredAndSortedItems.slice(0, page * PAGE_SIZE);
  }, [filteredAndSortedItems, page]);

  const hasMore = paginatedItems.length < filteredAndSortedItems.length;

  const loadMore = useCallback(() => {
    if (hasMore) {
      setPage((prev) => prev + 1);
    }
  }, [hasMore]);

  return {
    items,
    filteredItems: paginatedItems,
    totalFilteredCount: filteredAndSortedItems.length,
    hasMore,
    loadMore,
    addItem,
    removeItem,
    removeMultiple,
    clearAll,
    filter,
    setFilter: (newFilter: 'all' | MediaType) => {
      setFilter(newFilter);
      setPage(1);
    },
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy: (newSort: SortOption) => {
      setSortBy(newSort);
      setPage(1);
    },
    viewMode,
    setViewMode: updateViewMode,
    selectedIds,
    toggleSelect,
    selectAllVisible,
    clearSelection,
    hasItems: items.length > 0,
    isLoadingServer,
    refreshFromServer,
  };
}

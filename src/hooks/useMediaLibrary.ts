import { useCallback, useEffect, useMemo, useState } from 'react';
import { MediaItem, MediaType } from '../types';
import { mediaApiClient } from '../lib/api/mediaClient';

const STORAGE_KEY = 'airshare_media_history';

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
  const [isLoadingServer, setIsLoadingServer] = useState(false);

  // Sync initial state from server repository on mount
  useEffect(() => {
    let isMounted = true;
    async function syncFromServer() {
      try {
        setIsLoadingServer(true);
        const serverList = await mediaApiClient.fetchList();
        if (!isMounted) return;

        setItems((prev) => {
          // Merge server list with local items (preserving local session blobUrls if match)
          const mergedMap = new Map<string, MediaItem>();

          // First add local items
          prev.forEach((local) => {
            mergedMap.set(local.id, local);
          });

          // Overlay or add server items
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

  // Persist items to local storage (saving metadata & share URLs)
  useEffect(() => {
    try {
      const sanitized = items.map((item) => ({
        ...item,
        blobUrl: undefined, // Do not persist ephemeral blob URLs
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    } catch (e) {
      console.warn('Failed to save media history to storage:', e);
    }
  }, [items]);

  const addItem = useCallback((item: MediaItem) => {
    setItems((prev) => [item, ...prev.filter((i) => i.id !== item.id)]);
  }, []);

  const removeItem = useCallback(async (id: string) => {
    // 1. Update UI optimistically
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

    // 2. Request backend deletion
    try {
      await mediaApiClient.deleteMedia(id);
    } catch (err) {
      console.warn(`Failed to delete media ${id} on server:`, err);
    }
  }, []);

  const clearAll = useCallback(async () => {
    // 1. Clean blob URLs
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

    // 2. Clear server repository
    try {
      await mediaApiClient.clearAll();
    } catch (err) {
      console.warn('Failed to clear all media on server:', err);
    }
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesType = filter === 'all' || item.type === filter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.audioMeta?.title?.toLowerCase().includes(q) ||
        item.audioMeta?.artist?.toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [items, filter, searchQuery]);

  return {
    items,
    filteredItems,
    addItem,
    removeItem,
    clearAll,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    hasItems: items.length > 0,
    isLoadingServer,
  };
}

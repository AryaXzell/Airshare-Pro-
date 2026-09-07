/**
 * Real Catbox Upstream Health Check with module-level in-memory caching.
 * Performs lightweight HTTP HEAD verification to avoid hammering Catbox.
 */
import { getRedisClient, isUpstashConfigured } from './redis-client';

export interface CatboxHealthStatus {
  available: boolean;
  latencyMs: number | null;
  lastChecked: string;
}

export interface SyncBrokenItem {
  id: string;
  name: string;
  shareUrl: string;
  formattedSize: string;
  createdAt: number;
}

export interface SyncCheckSummary {
  timestamp: number;
  totalChecked: number;
  healthyCount: number;
  brokenCount: number;
  brokenItems: SyncBrokenItem[];
}

const CACHE_TTL_MS = 30 * 1000; // 30 seconds cache window
let cachedHealth: CatboxHealthStatus | null = null;
let pendingCheckPromise: Promise<CatboxHealthStatus> | null = null;
let inMemoryLastSyncCheck: SyncCheckSummary | null = null;

export async function checkCatboxHealth(forceRefresh = false): Promise<CatboxHealthStatus> {
  const now = Date.now();

  // Return fresh cached status if within TTL
  if (!forceRefresh && cachedHealth) {
    const age = now - new Date(cachedHealth.lastChecked).getTime();
    if (age < CACHE_TTL_MS) {
      return cachedHealth;
    }
  }

  // Deduplicate in-flight requests
  if (pendingCheckPromise) {
    return pendingCheckPromise;
  }

  pendingCheckPromise = (async (): Promise<CatboxHealthStatus> => {
    const startTime = Date.now();
    try {
      // Send lightweight HEAD request to Catbox root endpoint with 3s timeout
      const response = await fetch('https://catbox.moe', {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
        headers: {
          'User-Agent': 'AirSharePro-HealthCheck/1.0',
        },
      });

      // Any HTTP status code below 500 confirms upstream server availability
      const isUp = response.status < 500;
      const latency = Date.now() - startTime;

      cachedHealth = {
        available: isUp,
        latencyMs: isUp ? latency : null,
        lastChecked: new Date().toISOString(),
      };
      return cachedHealth;
    } catch (err) {
      cachedHealth = {
        available: false,
        latencyMs: null,
        lastChecked: new Date().toISOString(),
      };
      return cachedHealth;
    } finally {
      pendingCheckPromise = null;
    }
  })();

  return pendingCheckPromise;
}

/**
 * Verifies whether a specific file exists on Catbox via a lightweight HEAD request.
 * Returns true if status is 200 OK; false if 404 or request fails.
 */
export async function verifyFileExistsOnCatbox(shareUrl: string): Promise<boolean> {
  if (!shareUrl || typeof shareUrl !== 'string' || !shareUrl.startsWith('http')) {
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(shareUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'AirSharePro-SyncChecker/1.0',
      },
    });

    clearTimeout(timeoutId);
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Batches file existence checks against Catbox (max concurrency per batch)
 * to avoid flooding the Catbox upstream server.
 */
export async function verifyFilesBatch<T extends { shareUrl: string }>(
  items: T[],
  concurrency = 10
): Promise<{ item: T; exists: boolean }[]> {
  const results: { item: T; exists: boolean }[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const exists = await verifyFileExistsOnCatbox(item.shareUrl);
        return { item, exists };
      })
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Retrieves the last sync check summary from Redis or in-memory fallback.
 */
export async function getLastSyncCheck(): Promise<SyncCheckSummary | null> {
  if (isUpstashConfigured()) {
    const redis = getRedisClient();
    if (redis) {
      try {
        const raw = await redis.get<string | SyncCheckSummary>('admin:last_sync_check');
        if (raw) {
          return typeof raw === 'string' ? JSON.parse(raw) : raw;
        }
      } catch {
        // Fallback to in-memory
      }
    }
  }
  return inMemoryLastSyncCheck;
}

/**
 * Persists the sync check summary to Redis (30d TTL) and in-memory cache.
 */
export async function saveLastSyncCheck(summary: SyncCheckSummary): Promise<void> {
  inMemoryLastSyncCheck = summary;
  if (isUpstashConfigured()) {
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.set('admin:last_sync_check', JSON.stringify(summary), {
          ex: 30 * 24 * 60 * 60,
        });
      } catch {
        // Fail-open
      }
    }
  }
}

/**
 * Updates the sync check summary when an orphan item is removed from history.
 */
export async function removeSyncCheckItem(id: string): Promise<void> {
  const current = await getLastSyncCheck();
  if (!current) return;

  const nextBroken = current.brokenItems.filter((item) => item.id !== id);
  const updated: SyncCheckSummary = {
    ...current,
    brokenCount: nextBroken.length,
    brokenItems: nextBroken,
  };

  await saveLastSyncCheck(updated);
}

/**
 * Utility to clear the cache (primarily for unit tests).
 */
export function resetCatboxHealthCache(): void {
  cachedHealth = null;
  pendingCheckPromise = null;
  inMemoryLastSyncCheck = null;
}


import { Redis } from '@upstash/redis';
import { DailyStats, MediaObject, PublicMediaView, WeeklyTrendItem } from '../../types';
import { getRedisClient, isUpstashConfigured } from '../storage/redis-client';
import { getMediaRepository } from './media-repository';

const STATS_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days retention
const TOTAL_ITEMS_KEY = 'stats:total_items_ever';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getTodayDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Strips sensitive internal identifiers (strictly excludes sessionId)
 * by destructuring permitted properties one by one.
 */
function toPublicMediaView(item: MediaObject): PublicMediaView {
  const publicView: PublicMediaView = {
    id: item.id,
    name: item.name,
    originalFileName: item.originalFileName,
    type: item.type,
    mimeType: item.mimeType,
    size: item.size,
    formattedSize: item.formattedSize,
    shareUrl: item.shareUrl,
    uploaderCountryCode: item.uploaderCountryCode,
    uploaderCountryName: item.uploaderCountryName,
    createdAt: item.createdAt,
  };

  if (item.audioMeta) publicView.audioMeta = item.audioMeta;
  if (item.videoMeta) publicView.videoMeta = item.videoMeta;
  if (item.imageMeta) publicView.imageMeta = item.imageMeta;
  if (item.isTextPreviewable !== undefined) publicView.isTextPreviewable = item.isTextPreviewable;
  if (item.textLanguageHint) publicView.textLanguageHint = item.textLanguageHint;

  return publicView;
}

/**
 * In-memory fallback analytics storage for local development
 * and when Upstash Redis is temporarily unavailable.
 */
class InMemoryAnalyticsStore {
  public uploadsByDate = new Map<string, number>();
  public bytesByDate = new Map<string, number>();
  public viewsByDate = new Map<string, number>();
  public byTypeByDate = new Map<string, Map<string, number>>();
  public byCountryByDate = new Map<string, Map<string, number>>();
  public fileViews = new Map<string, number>();
  public recentUploads: PublicMediaView[] = [];
  public totalItemsEver = 0;

  recordUpload(item: MediaObject) {
    const today = getTodayDateString();
    this.uploadsByDate.set(today, (this.uploadsByDate.get(today) || 0) + 1);
    this.bytesByDate.set(today, (this.bytesByDate.get(today) || 0) + item.size);

    if (!this.byTypeByDate.has(today)) this.byTypeByDate.set(today, new Map());
    const typeMap = this.byTypeByDate.get(today)!;
    typeMap.set(item.type, (typeMap.get(item.type) || 0) + 1);

    const country = item.uploaderCountryCode || 'UNKNOWN';
    if (!this.byCountryByDate.has(today)) this.byCountryByDate.set(today, new Map());
    const countryMap = this.byCountryByDate.get(today)!;
    countryMap.set(country, (countryMap.get(country) || 0) + 1);

    this.totalItemsEver += 1;

    // Keep up to 100 most recent items in memory (strictly PublicMediaView without sessionId)
    const publicItem = toPublicMediaView(item);
    this.recentUploads.unshift(publicItem);
    if (this.recentUploads.length > 100) {
      this.recentUploads = this.recentUploads.slice(0, 100);
    }
  }

  recordDeletion(count = 1) {
    this.totalItemsEver = Math.max(0, this.totalItemsEver - count);
  }

  removeRecentUpload(id: string) {
    this.recentUploads = this.recentUploads.filter((item) => item.id !== id);
  }

  getTotalItemsEver(): number {
    return this.totalItemsEver;
  }

  recordShareView(id: string) {
    const today = getTodayDateString();
    this.fileViews.set(id, (this.fileViews.get(id) || 0) + 1);
    this.viewsByDate.set(today, (this.viewsByDate.get(today) || 0) + 1);
  }

  getDailySummary(date: string): DailyStats {
    const uploads = this.uploadsByDate.get(date) || 0;
    const bytes = this.bytesByDate.get(date) || 0;
    const totalViews = this.viewsByDate.get(date) || 0;

    const byTypeRecord: Record<string, number> = {};
    const typeMap = this.byTypeByDate.get(date);
    if (typeMap) {
      typeMap.forEach((v, k) => {
        byTypeRecord[k] = v;
      });
    }

    const byCountryRecord: Record<string, number> = {};
    const countryMap = this.byCountryByDate.get(date);
    if (countryMap) {
      countryMap.forEach((v, k) => {
        byCountryRecord[k] = v;
      });
    }

    const averageFileSize = uploads > 0 ? Math.round(bytes / uploads) : 0;

    return {
      date,
      uploads,
      bytes,
      formattedBytes: formatBytes(bytes),
      totalViews,
      averageFileSize,
      formattedAverageSize: formatBytes(averageFileSize),
      byType: byTypeRecord,
      byCountry: byCountryRecord,
    };
  }

  getTopFiles(limit: number): { id: string; views: number }[] {
    const sorted = Array.from(this.fileViews.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
    return sorted.map(([id, views]) => ({ id, views }));
  }

  getWeeklyTrend(): WeeklyTrendItem[] {
    const result: WeeklyTrendItem[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = getTodayDateString(d);
      const uploads = this.uploadsByDate.get(dateStr) || 0;
      const bytes = this.bytesByDate.get(dateStr) || 0;
      const views = this.viewsByDate.get(dateStr) || 0;

      result.push({
        date: dateStr,
        uploads,
        bytes,
        formattedBytes: formatBytes(bytes),
        views,
      });
    }

    return result;
  }

  getViewCount(id: string): number {
    return this.fileViews.get(id) || 0;
  }

  getRecentUploads(limit: number): PublicMediaView[] {
    return this.recentUploads.slice(0, limit);
  }
}

const inMemoryStore = new InMemoryAnalyticsStore();

/**
 * Analytics Repository with Redis pipeline support and in-memory fallback.
 */
export class AnalyticsRepository {
  constructor(private redisClient?: Redis | null) {}

  private getRedis(): Redis | null {
    if (this.redisClient !== undefined) {
      return this.redisClient;
    }
    if (isUpstashConfigured()) {
      return getRedisClient();
    }
    return null;
  }

  /**
   * Records upload event metrics in Redis (or in-memory fallback).
   * Fail-safe: Any errors are caught and logged without disrupting callers.
   * STRICT SECURITY: Saves only safe PublicMediaView without sessionId.
   */
  public async recordUpload(item: MediaObject): Promise<void> {
    try {
      inMemoryStore.recordUpload(item);

      const redis = this.getRedis();
      if (!redis) return;

      const today = getTodayDateString();
      const countryCode = item.uploaderCountryCode || 'UNKNOWN';
      const publicView = toPublicMediaView(item);

      const pipeline = redis.pipeline();
      const uploadKey = `stats:uploads:${today}`;
      const bytesKey = `stats:bytes:${today}`;
      const typeKey = `stats:by_type:${today}`;
      const countryKey = `stats:by_country:${today}`;
      const recentIndexKey = 'stats:recent_uploads';
      const recentDataKey = `stats:media_obj:${item.id}`;

      pipeline.incr(uploadKey);
      pipeline.incrby(bytesKey, item.size);
      pipeline.hincrby(typeKey, item.type, 1);
      pipeline.hincrby(countryKey, countryCode, 1);
      pipeline.incr(TOTAL_ITEMS_KEY);

      // Store in global recent uploads sorted set (score: timestamp)
      pipeline.zadd(recentIndexKey, { score: item.createdAt, member: item.id });
      // Keep recent item object data as strictly sanitized PublicMediaView (NO sessionId)
      pipeline.set(recentDataKey, JSON.stringify(publicView));

      // Expire daily counter keys after retention window
      pipeline.expire(uploadKey, STATS_TTL_SECONDS);
      pipeline.expire(bytesKey, STATS_TTL_SECONDS);
      pipeline.expire(typeKey, STATS_TTL_SECONDS);
      pipeline.expire(countryKey, STATS_TTL_SECONDS);
      pipeline.expire(recentDataKey, STATS_TTL_SECONDS);

      await pipeline.exec();
    } catch (err) {
      console.warn('[ANALYTICS_RECORD_UPLOAD_ERROR] Gagal mencatat analitik upload, fail-open:', err);
    }
  }

  /**
   * Records deletion event to keep cumulative count accurate.
   * Fail-safe: errors do not disrupt caller.
   */
  public async recordDeletion(count = 1): Promise<void> {
    try {
      inMemoryStore.recordDeletion(count);

      const redis = this.getRedis();
      if (!redis) return;

      const current = await redis.get<number | string>(TOTAL_ITEMS_KEY);
      const currentNum = Number(current) || 0;
      const nextNum = Math.max(0, currentNum - count);
      await redis.set(TOTAL_ITEMS_KEY, nextNum);
    } catch (err) {
      console.warn('[ANALYTICS_RECORD_DELETION_ERROR] Gagal mencatat analitik deletion, fail-open:', err);
    }
  }

  /**
   * Immediately purges an item from recent uploads cache in Redis and memory.
   */
  public async removeRecentUpload(id: string): Promise<void> {
    try {
      inMemoryStore.removeRecentUpload(id);

      const redis = this.getRedis();
      if (!redis) return;

      const pipeline = redis.pipeline();
      pipeline.zrem('stats:recent_uploads', id);
      pipeline.del(`stats:media_obj:${id}`);
      await pipeline.exec();
    } catch (err) {
      console.warn('[ANALYTICS_REMOVE_RECENT_ERROR] Fail-open:', err);
    }
  }

  /**
   * Returns the cumulative total of items currently stored.
   */
  public async getTotalItemsEver(): Promise<number> {
    const redis = this.getRedis();
    if (!redis) {
      return inMemoryStore.getTotalItemsEver();
    }

    try {
      const val = await redis.get<number | string>(TOTAL_ITEMS_KEY);
      if (val !== null && val !== undefined) {
        return Math.max(0, Number(val) || 0);
      }

      // Fallback: estimate from recent uploads sorted set length if key not initialized yet
      const count = await redis.zcard('stats:recent_uploads');
      if (count > 0) {
        await redis.set(TOTAL_ITEMS_KEY, count);
        return count;
      }
      return inMemoryStore.getTotalItemsEver();
    } catch (err) {
      console.warn('[ANALYTICS_GET_TOTAL_ITEMS_ERROR] Gagal membaca total items ever:', err);
      return inMemoryStore.getTotalItemsEver();
    }
  }

  /**
   * Records share view event metrics.
   * Fail-safe: Any errors are caught and logged without disrupting callers.
   */
  public async recordShareView(id: string): Promise<void> {
    try {
      inMemoryStore.recordShareView(id);

      const redis = this.getRedis();
      if (!redis) return;

      const today = getTodayDateString();
      const pipeline = redis.pipeline();

      const viewsKey = `stats:views:${id}`;
      const popularKey = 'stats:popular_files';
      const totalViewsKey = `stats:total_views:${today}`;

      pipeline.incr(viewsKey);
      pipeline.zincrby(popularKey, 1, id);
      pipeline.incr(totalViewsKey);
      pipeline.expire(totalViewsKey, STATS_TTL_SECONDS);

      await pipeline.exec();
    } catch (err) {
      console.warn('[ANALYTICS_RECORD_VIEW_ERROR] Gagal mencatat analitik view, fail-open:', err);
    }
  }

  /**
   * Retrieves summary metrics for a given date using Redis pipeline.
   */
  public async getDailySummary(date: string): Promise<DailyStats> {
    const redis = this.getRedis();
    if (!redis) {
      return inMemoryStore.getDailySummary(date);
    }

    try {
      const uploadKey = `stats:uploads:${date}`;
      const bytesKey = `stats:bytes:${date}`;
      const totalViewsKey = `stats:total_views:${date}`;
      const typeKey = `stats:by_type:${date}`;
      const countryKey = `stats:by_country:${date}`;

      const pipeline = redis.pipeline();
      pipeline.get<string | number>(uploadKey);
      pipeline.get<string | number>(bytesKey);
      pipeline.get<string | number>(totalViewsKey);
      pipeline.hgetall(typeKey);
      pipeline.hgetall(countryKey);

      const results = await pipeline.exec();

      const uploads = Number(results[0]) || 0;
      const bytes = Number(results[1]) || 0;
      const totalViews = Number(results[2]) || 0;
      const rawTypes = (results[3] as Record<string, string | number>) || {};
      const rawCountries = (results[4] as Record<string, string | number>) || {};

      const byType: Record<string, number> = {};
      for (const [k, v] of Object.entries(rawTypes)) {
        byType[k] = Number(v) || 0;
      }

      const byCountry: Record<string, number> = {};
      for (const [k, v] of Object.entries(rawCountries)) {
        byCountry[k] = Number(v) || 0;
      }

      const averageFileSize = uploads > 0 ? Math.round(bytes / uploads) : 0;

      return {
        date,
        uploads,
        bytes,
        formattedBytes: formatBytes(bytes),
        totalViews,
        averageFileSize,
        formattedAverageSize: formatBytes(averageFileSize),
        byType,
        byCountry,
      };
    } catch (err) {
      console.warn('[ANALYTICS_GET_DAILY_ERROR] Gagal membaca ringkasan harian Redis, fallback in-memory:', err);
      return inMemoryStore.getDailySummary(date);
    }
  }

  /**
   * Retrieves top most viewed files from Redis sorted set.
   */
  public async getTopFiles(limit = 10): Promise<{ id: string; views: number }[]> {
    const redis = this.getRedis();
    if (!redis) {
      return inMemoryStore.getTopFiles(limit);
    }

    try {
      // Upstash zrange with rev: true and withScores: true
      const rawResults = await redis.zrange('stats:popular_files', 0, limit - 1, {
        rev: true,
        withScores: true,
      });

      const items: { id: string; views: number }[] = [];
      if (Array.isArray(rawResults)) {
        for (let i = 0; i < rawResults.length; i += 2) {
          // Check if format is [id, score, id, score] or objects [{member, score}]
          const entry = rawResults[i];
          if (typeof entry === 'object' && entry !== null && 'member' in entry) {
            const obj = entry as { member: string; score: number };
            items.push({ id: String(obj.member), views: Number(obj.score) || 0 });
            // Since elements are objects, i increments normally
          } else {
            const id = String(entry);
            const score = Number(rawResults[i + 1]) || 0;
            items.push({ id, views: score });
          }
        }
      }

      return items;
    } catch (err) {
      console.warn('[ANALYTICS_GET_TOP_FILES_ERROR] Gagal membaca top files dari Redis, fallback in-memory:', err);
      return inMemoryStore.getTopFiles(limit);
    }
  }

  /**
   * Retrieves 7-day trend metrics for chart display.
   */
  public async getWeeklyTrend(): Promise<WeeklyTrendItem[]> {
    const redis = this.getRedis();
    if (!redis) {
      return inMemoryStore.getWeeklyTrend();
    }

    try {
      const dates: string[] = [];
      const now = new Date();

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dates.push(getTodayDateString(d));
      }

      const pipeline = redis.pipeline();
      for (const d of dates) {
        pipeline.get<string | number>(`stats:uploads:${d}`);
        pipeline.get<string | number>(`stats:bytes:${d}`);
        pipeline.get<string | number>(`stats:total_views:${d}`);
      }

      const results = await pipeline.exec();
      const trend: WeeklyTrendItem[] = [];

      for (let i = 0; i < dates.length; i++) {
        const uploads = Number(results[i * 3]) || 0;
        const bytes = Number(results[i * 3 + 1]) || 0;
        const views = Number(results[i * 3 + 2]) || 0;

        trend.push({
          date: dates[i],
          uploads,
          bytes,
          formattedBytes: formatBytes(bytes),
          views,
        });
      }

      return trend;
    } catch (err) {
      console.warn('[ANALYTICS_GET_WEEKLY_TREND_ERROR] Gagal membaca tren mingguan dari Redis, fallback in-memory:', err);
      return inMemoryStore.getWeeklyTrend();
    }
  }

  /**
   * Retrieves total view count for a specific file ID.
   */
  public async getViewCount(id: string): Promise<number> {
    const redis = this.getRedis();
    if (!redis) {
      return inMemoryStore.getViewCount(id);
    }

    try {
      const val = await redis.get<string | number>(`stats:views:${id}`);
      return Number(val) || 0;
    } catch (err) {
      console.warn('[ANALYTICS_GET_VIEW_COUNT_ERROR] Gagal membaca view count file:', err);
      return inMemoryStore.getViewCount(id);
    }
  }

  /**
   * Retrieves recent 50 uploads across all sessions for admin monitoring.
   * STRICT SECURITY: Returns only PublicMediaView objects (never exposes sessionId).
   */
  public async getRecentUploads(limit = 50): Promise<PublicMediaView[]> {
    const redis = this.getRedis();
    if (!redis) {
      return inMemoryStore.getRecentUploads(limit);
    }

    try {
      const recentIds: string[] = await redis.zrange('stats:recent_uploads', 0, limit - 1, {
        rev: true,
      });

      if (!recentIds || recentIds.length === 0) {
        return inMemoryStore.getRecentUploads(limit);
      }

      const keys = recentIds.map((id) => `stats:media_obj:${id}`);
      const rawObjects = await redis.mget<string[]>(...keys);

      const items: PublicMediaView[] = [];
      rawObjects.forEach((raw, idx) => {
        if (raw) {
          try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            // Guarantee stripping of any legacy sessionId if present in old redis keys
            const sanitized = toPublicMediaView(parsed as MediaObject);
            items.push(sanitized);
          } catch {
            // Ignore parse errors
          }
        } else {
          // If media_obj key expired or was missing, check in-memory
          const fallback = inMemoryStore.recentUploads.find((m) => m.id === recentIds[idx]);
          if (fallback) items.push(fallback);
        }
      });

      return items;
    } catch (err) {
      console.warn('[ANALYTICS_GET_RECENT_UPLOADS_ERROR] Gagal mengambil recent uploads:', err);
      return inMemoryStore.getRecentUploads(limit);
    }
  }
}

export const analyticsRepository = new AnalyticsRepository();

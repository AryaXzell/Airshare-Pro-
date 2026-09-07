import { getRedisClient, isUpstashConfigured } from '../storage/redis-client';
import crypto from 'crypto';

export interface AuditLogEntry {
  id: string;
  type: string;
  detail: string;
  ip: string;
  timestamp: number;
  adminTokenPreview?: string;
}

const inMemoryLogs: AuditLogEntry[] = [];
const MAX_LOG_ENTRIES = 500;
const AUDIT_LOG_TTL_SECONDS = 90 * 24 * 3600; // 90 days retention

export const auditLogRepository = {
  /**
   * Records an admin operational event into the audit log.
   */
  async recordAction(
    action: {
      type: string;
      detail: string;
      ip: string;
      timestamp?: number;
      adminTokenPreview?: string;
    }
  ): Promise<void> {
    const entry: AuditLogEntry = {
      id: crypto.randomBytes(8).toString('hex'),
      type: action.type,
      detail: action.detail,
      ip: action.ip || '127.0.0.1',
      timestamp: action.timestamp || Date.now(),
      adminTokenPreview: action.adminTokenPreview,
    };

    // Keep in-memory copy
    inMemoryLogs.unshift(entry);
    if (inMemoryLogs.length > MAX_LOG_ENTRIES) {
      inMemoryLogs.length = MAX_LOG_ENTRIES;
    }

    const redis = isUpstashConfigured() ? getRedisClient() : null;
    if (redis) {
      try {
        const pipeline = redis.pipeline();
        pipeline.lpush('audit_log', JSON.stringify(entry));
        pipeline.ltrim('audit_log', 0, MAX_LOG_ENTRIES - 1);
        pipeline.expire('audit_log', AUDIT_LOG_TTL_SECONDS);
        await pipeline.exec();
      } catch (err) {
        console.warn('[AUDIT_LOG] Gagal menyimpan log aktivitas ke Redis:', err);
      }
    }
  },

  /**
   * Retrieves the most recent audit log entries.
   */
  async getRecentActions(limit = 50): Promise<AuditLogEntry[]> {
    const safeLimit = Math.max(1, Math.min(MAX_LOG_ENTRIES, limit));
    const redis = isUpstashConfigured() ? getRedisClient() : null;

    if (redis) {
      try {
        const rawItems = await redis.lrange('audit_log', 0, safeLimit - 1);
        if (Array.isArray(rawItems) && rawItems.length > 0) {
          return rawItems.map((item) => {
            if (typeof item === 'string') {
              try {
                return JSON.parse(item) as AuditLogEntry;
              } catch {
                return {
                  id: 'unknown',
                  type: 'PARSING_ERROR',
                  detail: item,
                  ip: 'unknown',
                  timestamp: Date.now(),
                };
              }
            }
            return item as AuditLogEntry;
          });
        }
      } catch (err) {
        console.warn('[AUDIT_LOG] Gagal membaca log aktivitas dari Redis, menggunakan fallback in-memory:', err);
      }
    }

    return inMemoryLogs.slice(0, safeLimit);
  },
};

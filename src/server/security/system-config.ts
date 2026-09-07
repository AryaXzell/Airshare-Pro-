import { getRedisClient, isUpstashConfigured } from '../storage/redis-client';

export interface AnnouncementBanner {
  message: string;
  type: 'info' | 'warning' | 'success';
  enabled: boolean;
  updatedAt: number;
}

export interface FeatureFlags {
  pasteToUpload: boolean;
  qrCode: boolean;
  pwaInstallPrompt: boolean;
}

export interface UploadRateLimitConfig {
  limit: number;
  windowMs: number;
}

export interface SystemConfigData {
  maintenanceMode: boolean;
  announcement: AnnouncementBanner | null;
  maxUploadSize: number;
  formattedMaxSize: string;
  rateLimit: UploadRateLimitConfig;
  featureFlags: FeatureFlags;
}

export type SystemConfig = SystemConfigData;
export type AnnouncementConfig = AnnouncementBanner;

// In-memory fallbacks for single-process / development environments
const inMemoryConfig = {
  maintenanceMode: false,
  announcement: null as AnnouncementBanner | null,
  maxUploadSize: parseInt(process.env.MAX_UPLOAD_SIZE || '209715200', 10), // default 200MB
  rateLimit: {
    limit: parseInt(process.env.RATE_LIMIT_MAX_UPLOADS_PER_MIN || '20', 10),
    windowMs: 60 * 1000,
  },
  featureFlags: {
    pasteToUpload: true,
    qrCode: true,
    pwaInstallPrompt: true,
  } as FeatureFlags,
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// -------------------------------------------------------------
// 1. Maintenance Mode (Kill Switch)
// -------------------------------------------------------------

/**
 * Checks if Maintenance Mode (Kill Switch) is currently active.
 * Fail-safe: default to false if Redis is unreachable to avoid accidental lockouts.
 */
export async function isMaintenanceModeActive(): Promise<boolean> {
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const val = await redis.get<string>('config:maintenance_mode');
      if (val !== null && val !== undefined) {
        return val === 'true' || val === '1';
      }
    } catch (err) {
      console.warn('[SYSTEM_CONFIG] Gagal membaca maintenance mode dari Redis, fail-safe false:', err);
    }
  }
  return inMemoryConfig.maintenanceMode;
}

/**
 * Updates the Maintenance Mode (Kill Switch) state.
 */
export async function setMaintenanceMode(active: boolean): Promise<void> {
  inMemoryConfig.maintenanceMode = active;
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      await redis.set('config:maintenance_mode', active ? 'true' : 'false');
    } catch (err) {
      console.warn('[SYSTEM_CONFIG] Gagal menyimpan maintenance mode ke Redis:', err);
    }
  }
}

// -------------------------------------------------------------
// 2. System Announcement Banner
// -------------------------------------------------------------

/**
 * Retrieves the system announcement banner.
 */
export async function getAnnouncement(): Promise<AnnouncementBanner | null> {
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const raw = await redis.get<string | AnnouncementBanner>('config:announcement');
      if (raw) {
        const parsed: AnnouncementBanner = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return parsed;
      }
    } catch (err) {
      console.warn('[SYSTEM_CONFIG] Gagal membaca pengumuman dari Redis:', err);
    }
  }
  return inMemoryConfig.announcement;
}

/**
 * Updates the system announcement banner.
 */
export async function setAnnouncement(announcement: Omit<AnnouncementBanner, 'updatedAt'> & { updatedAt?: number }): Promise<void> {
  const finalAnnouncement: AnnouncementBanner = {
    ...announcement,
    updatedAt: announcement.updatedAt || Date.now(),
  };
  inMemoryConfig.announcement = finalAnnouncement;
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      await redis.set('config:announcement', JSON.stringify(finalAnnouncement));
    } catch (err) {
      console.warn('[SYSTEM_CONFIG] Gagal menyimpan pengumuman ke Redis:', err);
    }
  }
}

// -------------------------------------------------------------
// 3. Dynamic Max Upload Size
// -------------------------------------------------------------

/**
 * Retrieves the dynamic max upload size in bytes.
 * Fallback to process.env.MAX_UPLOAD_SIZE or 200MB.
 */
export async function getMaxUploadSize(): Promise<number> {
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const val = await redis.get<string | number>('config:max_upload_size');
      if (val !== null && val !== undefined) {
        const num = typeof val === 'number' ? val : parseInt(val, 10);
        if (!isNaN(num) && num > 0) {
          return num;
        }
      }
    } catch (err) {
      console.warn('[SYSTEM_CONFIG] Gagal membaca max_upload_size dari Redis:', err);
    }
  }
  return inMemoryConfig.maxUploadSize;
}

/**
 * Updates the dynamic max upload size (enforcing 1MB to 500MB boundary).
 */
export async function setMaxUploadSize(bytes: number): Promise<void> {
  const MIN_SIZE = 1024 * 1024; // 1MB
  const MAX_SIZE = 500 * 1024 * 1024; // 500MB (Catbox safe boundary)
  const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, bytes));

  inMemoryConfig.maxUploadSize = clamped;
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      await redis.set('config:max_upload_size', clamped.toString());
    } catch (err) {
      console.warn('[SYSTEM_CONFIG] Gagal menyimpan max_upload_size ke Redis:', err);
    }
  }
}

// -------------------------------------------------------------
// 4. Dynamic Upload Rate Limit
// -------------------------------------------------------------

/**
 * Retrieves the dynamic upload rate limit configuration.
 */
export async function getUploadRateLimit(): Promise<UploadRateLimitConfig> {
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const raw = await redis.get<string | UploadRateLimitConfig>('config:rate_limit_upload');
      if (raw) {
        const parsed: UploadRateLimitConfig = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed.limit > 0 && parsed.windowMs > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('[SYSTEM_CONFIG] Gagal membaca rate limit dari Redis:', err);
    }
  }
  return inMemoryConfig.rateLimit;
}

/**
 * Updates the dynamic upload rate limit configuration.
 */
export async function setUploadRateLimit(limit: number, windowMs: number): Promise<void> {
  const safeLimit = Math.max(1, Math.min(200, limit));
  const safeWindow = Math.max(10 * 1000, Math.min(3600 * 1000, windowMs));
  const config: UploadRateLimitConfig = { limit: safeLimit, windowMs: safeWindow };

  inMemoryConfig.rateLimit = config;
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      await redis.set('config:rate_limit_upload', JSON.stringify(config));
    } catch (err) {
      console.warn('[SYSTEM_CONFIG] Gagal menyimpan rate limit ke Redis:', err);
    }
  }
}

// -------------------------------------------------------------
// 5. Feature Flags
// -------------------------------------------------------------

/**
 * Retrieves dynamic feature flags.
 */
export async function getFeatureFlags(): Promise<FeatureFlags> {
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const hash = await redis.hgetall('config:feature_flags');
      if (hash && Object.keys(hash).length > 0) {
        return {
          pasteToUpload: hash.pasteToUpload !== 'false',
          qrCode: hash.qrCode !== 'false',
          pwaInstallPrompt: hash.pwaInstallPrompt !== 'false',
        };
      }
    } catch (err) {
      console.warn('[SYSTEM_CONFIG] Gagal membaca feature flags dari Redis:', err);
    }
  }
  return { ...inMemoryConfig.featureFlags };
}

/**
 * Updates dynamic feature flags in Redis hash.
 */
export async function setFeatureFlags(flags: Partial<FeatureFlags>): Promise<void> {
  const current = await getFeatureFlags();
  const updated: FeatureFlags = {
    ...current,
    ...flags,
  };

  inMemoryConfig.featureFlags = updated;
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      await redis.hset('config:feature_flags', {
        pasteToUpload: updated.pasteToUpload ? 'true' : 'false',
        qrCode: updated.qrCode ? 'true' : 'false',
        pwaInstallPrompt: updated.pwaInstallPrompt ? 'true' : 'false',
      });
    } catch (err) {
      console.warn('[SYSTEM_CONFIG] Gagal menyimpan feature flags ke Redis:', err);
    }
  }
}

// -------------------------------------------------------------
// 6. Complete System Config Summary
// -------------------------------------------------------------

export async function getAllSystemConfig(): Promise<SystemConfigData> {
  const [maintenanceMode, announcement, maxUploadSize, rateLimit, featureFlags] =
    await Promise.all([
      isMaintenanceModeActive(),
      getAnnouncement(),
      getMaxUploadSize(),
      getUploadRateLimit(),
      getFeatureFlags(),
    ]);

  return {
    maintenanceMode,
    announcement,
    maxUploadSize,
    formattedMaxSize: formatBytes(maxUploadSize),
    rateLimit,
    featureFlags,
  };
}

import { getRedisClient, isUpstashConfigured } from '../storage/redis-client';

export type MaintenanceLevel = 'off' | 'upload_only' | 'full_lockdown';

export interface AnnouncementBanner {
  message: string;
  type: 'info' | 'warning' | 'success';
  enabled: boolean;
  updatedAt: number;
  expiresAt?: number | null; // Unix timestamp ms kapan banner otomatis dianggap kadaluarsa, null = tidak ada batas waktu
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
  maintenanceLevel: MaintenanceLevel;
  maintenanceMode: boolean; // dipertahankan untuk backward compatibility
  announcement: AnnouncementBanner | null;
  maxUploadSize: number;
  formattedMaxSize: string;
  rateLimit: UploadRateLimitConfig;
  featureFlags: FeatureFlags;
}

export type SystemConfig = SystemConfigData;
export type AnnouncementConfig = AnnouncementBanner;

/**
 * Vercel Serverless hard limit for request/response body payload is 4.5MB.
 * To provide a reliable buffer for multipart form boundaries and headers,
 * safe maximum upload size on Vercel is capped at 4.2MB (4,200,000 bytes).
 */
export const VERCEL_SAFE_MAX_UPLOAD_SIZE = 4200000;
export const DEFAULT_MAX_UPLOAD_SIZE = 4 * 1024 * 1024; // 4MB default

function resolveInitialMaxUploadSize(): number {
  const configured = parseInt(process.env.MAX_UPLOAD_SIZE || `${DEFAULT_MAX_UPLOAD_SIZE}`, 10);
  const parsed = isNaN(configured) || configured <= 0 ? DEFAULT_MAX_UPLOAD_SIZE : configured;

  if (process.env.VERCEL) {
    if (parsed > VERCEL_SAFE_MAX_UPLOAD_SIZE) {
      console.warn(
        `[CONFIG_WARN_CRITICAL] MAX_UPLOAD_SIZE (${parsed} bytes) melebihi batas aman Vercel Serverless (maks ~4.2MB). Vercel memiliki hard limit 4.5MB untuk seluruh request body yang akan memutus koneksi dengan error 413 sebelum sampai ke aplikasi. Otomatis membatasi (clamp) maxUploadSize ke ${VERCEL_SAFE_MAX_UPLOAD_SIZE} bytes (4.2 MB).`
      );
      return VERCEL_SAFE_MAX_UPLOAD_SIZE;
    }
  }
  return parsed;
}

// In-memory fallbacks for single-process / development environments
const inMemoryConfig = {
  maintenanceLevel: 'off' as MaintenanceLevel,
  maintenanceMode: false,
  announcement: null as AnnouncementBanner | null,
  maxUploadSize: resolveInitialMaxUploadSize(),
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

function normalizeMaintenanceLevel(raw: string | null | undefined): MaintenanceLevel {
  if (raw === 'full_lockdown') return 'full_lockdown';
  if (raw === 'upload_only' || raw === 'true' || raw === '1') return 'upload_only'; // 'true' = data lama sebelum migrasi
  return 'off'; // termasuk raw === 'false' (data lama) atau null/tidak ada
}

export async function getMaintenanceLevel(): Promise<MaintenanceLevel> {
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const raw = await redis.get<string>('config:maintenance_mode');
      const level = normalizeMaintenanceLevel(raw);
      inMemoryConfig.maintenanceLevel = level;
      inMemoryConfig.maintenanceMode = level !== 'off';
      return level;
    } catch (err) {
      console.warn('[SYSTEM_CONFIG] Gagal membaca maintenance level dari Redis, memakai cache lokal:', err);
    }
  }
  return inMemoryConfig.maintenanceLevel ?? 'off';
}

export async function setMaintenanceLevel(level: MaintenanceLevel): Promise<void> {
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      await redis.set('config:maintenance_mode', level);
      inMemoryConfig.maintenanceLevel = level;
      inMemoryConfig.maintenanceMode = level !== 'off';
      return;
    } catch (err) {
      console.error('[SYSTEM_CONFIG_CRITICAL] Gagal menyimpan maintenance level ke Redis:', err);
      throw new Error('Gagal menyimpan status Kill Switch ke database persisten (Redis). Perubahan TIDAK tersimpan.');
    }
  }
  inMemoryConfig.maintenanceLevel = level;
  inMemoryConfig.maintenanceMode = level !== 'off';
  console.warn('[SYSTEM_CONFIG_WARN] Redis tidak dikonfigurasi. Kill Switch hanya tersimpan sementara di memori instance ini.');
}

/**
 * Checks if Maintenance Mode (Kill Switch) is currently active.
 * Fail-safe wrapper returning true if level is upload_only or full_lockdown.
 */
export async function isMaintenanceModeActive(): Promise<boolean> {
  const level = await getMaintenanceLevel();
  return level !== 'off';
}

/**
 * Updates the Maintenance Mode (Kill Switch) state (backward compatibility wrapper).
 */
export async function setMaintenanceMode(active: boolean): Promise<void> {
  await setMaintenanceLevel(active ? 'upload_only' : 'off');
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
      const raw = await redis.get<any>('config:announcement');
      if (raw) {
        let parsed: any = raw;
        while (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            break;
          }
        }
        if (parsed && typeof parsed === 'object') {
          const announcement: AnnouncementBanner = {
            message: String(parsed.message || ''),
            type: ['info', 'warning', 'success'].includes(parsed.type) ? parsed.type : 'info',
            enabled: parsed.enabled === true || parsed.enabled === 'true',
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
            expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : null,
          };
          inMemoryConfig.announcement = announcement;

          // Auto-expire check
          if (announcement.expiresAt != null && Date.now() >= announcement.expiresAt) {
            return null;
          }
          return announcement.enabled ? announcement : null;
        }
      } else {
        inMemoryConfig.announcement = null;
        return null;
      }
    } catch (err) {
      console.warn('[SYSTEM_CONFIG] Gagal membaca pengumuman dari Redis:', err);
    }
  }
  const cached = inMemoryConfig.announcement;
  if (cached && cached.expiresAt != null && Date.now() >= cached.expiresAt) {
    return null;
  }
  return cached && cached.enabled ? cached : null;
}

/**
 * Updates the system announcement banner.
 */
export async function setAnnouncement(
  announcement: Omit<AnnouncementBanner, 'updatedAt'> & { updatedAt?: number }
): Promise<void> {
  const finalAnnouncement: AnnouncementBanner = {
    message: String(announcement.message || '').trim(),
    type: ['info', 'warning', 'success'].includes(announcement.type) ? announcement.type : 'info',
    enabled: announcement.enabled === true || (announcement.enabled as any) === 'true',
    updatedAt: Date.now(),
    expiresAt: typeof announcement.expiresAt === 'number' ? announcement.expiresAt : null,
  };
  inMemoryConfig.announcement = finalAnnouncement;
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      await redis.set('config:announcement', JSON.stringify(finalAnnouncement));
    } catch (err) {
      console.error('[SYSTEM_CONFIG_CRITICAL] Gagal menyimpan pengumuman ke Redis:', err);
      throw new Error('Gagal menyimpan konfigurasi banner ke database persisten (Redis).');
    }
  }
}

/**
 * Clears the system announcement banner permanently.
 */
export async function clearAnnouncement(): Promise<void> {
  inMemoryConfig.announcement = null;
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      await redis.del('config:announcement');
    } catch (err) {
      console.error('[SYSTEM_CONFIG_CRITICAL] Gagal menghapus pengumuman dari Redis:', err);
      throw new Error('Gagal menghapus konfigurasi banner dari database persisten (Redis).');
    }
  }
}

// -------------------------------------------------------------
// 3. Dynamic Max Upload Size
// -------------------------------------------------------------

/**
 * Retrieves the dynamic max upload size in bytes.
 * Fallback to process.env.MAX_UPLOAD_SIZE or 4MB default.
 * Automatically clamped to VERCEL_SAFE_MAX_UPLOAD_SIZE on Vercel.
 */
export async function getMaxUploadSize(): Promise<number> {
  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const val = await redis.get<string | number>('config:max_upload_size');
      if (val !== null && val !== undefined) {
        const num = typeof val === 'number' ? val : parseInt(val, 10);
        if (!isNaN(num) && num > 0) {
          if (process.env.VERCEL && num > VERCEL_SAFE_MAX_UPLOAD_SIZE) {
            return VERCEL_SAFE_MAX_UPLOAD_SIZE;
          }
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
 * Updates the dynamic max upload size (enforcing 1MB to 500MB boundary, or clamped on Vercel).
 */
export async function setMaxUploadSize(bytes: number): Promise<void> {
  const MIN_SIZE = 1024 * 1024; // 1MB
  const maxLimit = process.env.VERCEL ? VERCEL_SAFE_MAX_UPLOAD_SIZE : 500 * 1024 * 1024;
  const clamped = Math.max(MIN_SIZE, Math.min(maxLimit, bytes));

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
  const [maintenanceLevel, announcement, maxUploadSize, rateLimit, featureFlags] =
    await Promise.all([
      getMaintenanceLevel(),
      getAnnouncement(),
      getMaxUploadSize(),
      getUploadRateLimit(),
      getFeatureFlags(),
    ]);

  return {
    maintenanceLevel,
    maintenanceMode: maintenanceLevel !== 'off',
    announcement,
    maxUploadSize,
    formattedMaxSize: formatBytes(maxUploadSize),
    rateLimit,
    featureFlags,
  };
}

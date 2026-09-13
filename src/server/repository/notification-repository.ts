import { getRedisClient, isUpstashConfigured } from '../storage/redis-client';
import crypto from 'crypto';

export type NotificationLevel = 'error' | 'warning' | 'info' | 'success';
export type NotificationCategory = 'ai' | 'sync' | 'security' | 'storage' | 'system';

export interface NotificationItem {
  id: string;
  timestamp: number;
  level: NotificationLevel;
  title: string;
  message: string;
  rawDetails?: string;
  read: boolean;
  category: NotificationCategory;
}

const inMemoryNotifications: NotificationItem[] = [];
const MAX_NOTIFICATIONS = 200;
const NOTIFICATION_TTL_SECONDS = 30 * 24 * 3600; // 30 hari retensi

/**
 * Inisialisasi awal notifikasi sistem jika memori masih kosong
 */
function seedInitialNotifications(): void {
  if (inMemoryNotifications.length > 0) return;

  const now = Date.now();
  inMemoryNotifications.push(
    {
      id: 'init_sys_1',
      timestamp: now - 60000 * 5,
      level: 'info',
      title: 'Sistem Admin Aktif',
      message: 'Dashboard analitik dan pemantauan sistem AirShare Pro siap digunakan.',
      rawDetails: 'System initialized successfully. All monitoring modules are operational.',
      read: true,
      category: 'system',
    },
    {
      id: 'init_sys_2',
      timestamp: now - 60000 * 2,
      level: 'success',
      title: 'Pemeriksaan Kesehatan Berkas',
      message: 'Koneksi Catbox dan modul repositori berjalan optimal tanpa kendala.',
      rawDetails: 'Health check OK: Storage provider upstream verified HTTP 200.',
      read: true,
      category: 'storage',
    }
  );
}

seedInitialNotifications();

export const notificationRepository = {
  /**
   * Menambahkan notifikasi baru ke repository (in-memory + Upstash Redis)
   */
  async addNotification(params: {
    level: NotificationLevel;
    title: string;
    message: string;
    rawDetails?: string;
    category?: NotificationCategory;
  }): Promise<NotificationItem> {
    const item: NotificationItem = {
      id: 'notif_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex'),
      timestamp: Date.now(),
      level: params.level,
      title: params.title || (params.level === 'error' ? 'Pemberitahuan Kesalahan' : params.level === 'warning' ? 'Peringatan Sistem' : 'Informasi Sistem'),
      message: params.message,
      rawDetails: params.rawDetails,
      read: false,
      category: params.category || 'system',
    };

    inMemoryNotifications.unshift(item);
    if (inMemoryNotifications.length > MAX_NOTIFICATIONS) {
      inMemoryNotifications.length = MAX_NOTIFICATIONS;
    }

    const redis = isUpstashConfigured() ? getRedisClient() : null;
    if (redis) {
      try {
        const pipeline = redis.pipeline();
        pipeline.lpush('admin_notifications', JSON.stringify(item));
        pipeline.ltrim('admin_notifications', 0, MAX_NOTIFICATIONS - 1);
        pipeline.expire('admin_notifications', NOTIFICATION_TTL_SECONDS);
        await pipeline.exec();
      } catch (err) {
        console.warn('[NOTIF_REPO] Gagal menyimpan notifikasi ke Redis:', err);
      }
    }

    return item;
  },

  /**
   * Mengambil daftar notifikasi terbaru dari Redis / memori
   */
  async getNotifications(limit: number = 50): Promise<NotificationItem[]> {
    const redis = isUpstashConfigured() ? getRedisClient() : null;
    if (redis) {
      try {
        const rawItems = await redis.lrange('admin_notifications', 0, limit - 1);
        if (rawItems && Array.isArray(rawItems) && rawItems.length > 0) {
          const parsed: NotificationItem[] = [];
          for (const item of rawItems) {
            try {
              parsed.push(typeof item === 'string' ? JSON.parse(item) : item);
            } catch (_) {}
          }
          if (parsed.length > 0) {
            return parsed;
          }
        }
      } catch (err) {
        console.warn('[NOTIF_REPO] Gagal mengambil notifikasi dari Redis, beralih ke memori lokal:', err);
      }
    }

    return inMemoryNotifications.slice(0, limit);
  },

  /**
   * Menghitung notifikasi yang belum dibaca
   */
  async getUnreadCount(): Promise<number> {
    const list = await this.getNotifications(MAX_NOTIFICATIONS);
    return list.filter((n) => !n.read).length;
  },

  /**
   * Menandai notifikasi sebagai telah dibaca (satu atau semua)
   */
  async markAsRead(id?: string): Promise<void> {
    if (id) {
      const found = inMemoryNotifications.find((n) => n.id === id);
      if (found) found.read = true;
    } else {
      inMemoryNotifications.forEach((n) => {
        n.read = true;
      });
    }

    const redis = isUpstashConfigured() ? getRedisClient() : null;
    if (redis) {
      try {
        const current = await this.getNotifications(MAX_NOTIFICATIONS);
        if (id) {
          const target = current.find((n) => n.id === id);
          if (target) target.read = true;
        } else {
          current.forEach((n) => {
            n.read = true;
          });
        }

        const pipeline = redis.pipeline();
        pipeline.del('admin_notifications');
        if (current.length > 0) {
          const serialized = current.map((item) => JSON.stringify(item));
          pipeline.rpush('admin_notifications', ...serialized);
          pipeline.expire('admin_notifications', NOTIFICATION_TTL_SECONDS);
        }
        await pipeline.exec();
      } catch (err) {
        console.warn('[NOTIF_REPO] Gagal memperbarui status dibaca di Redis:', err);
      }
    }
  },

  /**
   * Menghapus seluruh riwayat notifikasi
   */
  async clearNotifications(): Promise<void> {
    inMemoryNotifications.length = 0;

    const redis = isUpstashConfigured() ? getRedisClient() : null;
    if (redis) {
      try {
        await redis.del('admin_notifications');
      } catch (err) {
        console.warn('[NOTIF_REPO] Gagal menghapus notifikasi di Redis:', err);
      }
    }
  },
};

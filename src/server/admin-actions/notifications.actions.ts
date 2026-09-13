import { Request, Response } from 'express';
import { notificationRepository, NotificationLevel, NotificationCategory } from '../repository/notification-repository';

/**
 * Mengambil daftar seluruh riwayat notifikasi admin beserta counter belum dibaca
 */
export async function getNotificationsAction(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const notifications = await notificationRepository.getNotifications(limit);
    const unreadCount = notifications.filter((n) => !n.read).length;

    res.json({
      success: true,
      unreadCount,
      notifications,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_NOTIFICATIONS_FAILED', message: err?.message || 'Gagal mengambil riwayat notifikasi.' },
    });
  }
}

/**
 * Mencatat notifikasi baru ke server dari antarmuka admin
 */
export async function logNotificationAction(req: Request, res: Response): Promise<void> {
  try {
    const { level, title, message, rawDetails, category } = req.body || {};

    if (!message || typeof message !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'Pesan notifikasi wajib diisi.' },
      });
      return;
    }

    const validLevels: NotificationLevel[] = ['error', 'warning', 'info', 'success'];
    const resolvedLevel: NotificationLevel = validLevels.includes(level) ? level : 'info';

    const validCategories: NotificationCategory[] = ['ai', 'sync', 'security', 'storage', 'system'];
    const resolvedCategory: NotificationCategory = validCategories.includes(category) ? category : 'system';

    const created = await notificationRepository.addNotification({
      level: resolvedLevel,
      title: (title && String(title).slice(0, 100)) || (resolvedLevel === 'error' ? 'Pemberitahuan Kesalahan' : 'Notifikasi Sistem'),
      message: String(message).slice(0, 500),
      rawDetails: rawDetails ? String(rawDetails).slice(0, 5000) : undefined,
      category: resolvedCategory,
    });

    const unreadCount = await notificationRepository.getUnreadCount();

    res.json({
      success: true,
      notification: created,
      unreadCount,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'LOG_NOTIFICATION_FAILED', message: err?.message || 'Gagal mencatat notifikasi.' },
    });
  }
}

/**
 * Menandai satu atau semua notifikasi telah dibaca
 */
export async function markNotificationReadAction(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.body || {};
    await notificationRepository.markAsRead(id);
    const unreadCount = await notificationRepository.getUnreadCount();

    res.json({
      success: true,
      unreadCount,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'MARK_READ_FAILED', message: err?.message || 'Gagal menandai notifikasi telah dibaca.' },
    });
  }
}

/**
 * Membersihkan seluruh riwayat notifikasi
 */
export async function clearNotificationsAction(req: Request, res: Response): Promise<void> {
  try {
    await notificationRepository.clearNotifications();

    res.json({
      success: true,
      unreadCount: 0,
      message: 'Seluruh riwayat notifikasi berhasil dibersihkan.',
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'CLEAR_NOTIFICATIONS_FAILED', message: err?.message || 'Gagal membersihkan riwayat notifikasi.' },
    });
  }
}

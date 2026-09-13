import { Request, Response } from 'express';
import {
  getAllSystemConfig,
  setMaintenanceLevel,
  MaintenanceLevel,
  setAnnouncement,
  clearAnnouncement,
  setMaxUploadSize,
  setUploadRateLimit,
  setFeatureFlags,
} from '../security/system-config';
import { auditLogRepository } from '../repository/audit-log-repository';
import { getClientIp } from '../security/client-ip';
import { alertMaintenanceModeChanged } from '../telegram/telegram-notifier';

export async function updateConfig(req: Request, res: Response): Promise<void> {
  try {
    const clientIp = getClientIp(req);
    const { maxUploadSize, rateLimit, announcement, featureFlags, clearAnnouncement: shouldClearAnnouncement } = req.body || {};
    const changes: string[] = [];

    if (typeof maxUploadSize === 'number' && maxUploadSize >= 1024 * 1024 && maxUploadSize <= 500 * 1024 * 1024) {
      await setMaxUploadSize(maxUploadSize);
      changes.push(`maxUploadSize: ${Math.round(maxUploadSize / (1024 * 1024))} MB`);
    }

    if (rateLimit && typeof rateLimit.limit === 'number') {
      const limit = Math.max(1, Math.min(200, rateLimit.limit));
      const windowMs = typeof rateLimit.windowMs === 'number' ? rateLimit.windowMs : 60000;
      await setUploadRateLimit(limit, windowMs);
      changes.push(`rateLimit: ${limit}/mnt`);
    }

    if (shouldClearAnnouncement) {
      await clearAnnouncement();
      changes.push('announcement: Dihapus permanen');
    } else if (announcement && typeof announcement.message === 'string') {
      const validTypes = ['info', 'warning', 'success'] as const;
      const type = validTypes.includes(announcement.type) ? announcement.type : 'info';
      
      let validExpiresAt: number | null = null;
      if (typeof announcement.expiresAt === 'number' && announcement.expiresAt > Date.now()) {
        validExpiresAt = announcement.expiresAt;
      }

      await setAnnouncement({
        message: announcement.message,
        type,
        enabled: Boolean(announcement.enabled),
        expiresAt: validExpiresAt,
      });
      changes.push(`announcement: ${announcement.enabled ? 'Aktif' : 'Nonaktif'} ("${announcement.message.substring(0, 30)}")`);
    }

    if (featureFlags && typeof featureFlags === 'object') {
      await setFeatureFlags({
        pasteToUpload: Boolean(featureFlags.pasteToUpload),
        qrCode: Boolean(featureFlags.qrCode),
        pwaInstallPrompt: Boolean(featureFlags.pwaInstallPrompt),
      });
      changes.push(`featureFlags: paste=${Boolean(featureFlags.pasteToUpload)}, qr=${Boolean(featureFlags.qrCode)}, pwa=${Boolean(featureFlags.pwaInstallPrompt)}`);
    }

    const updatedConfig = await getAllSystemConfig();

    await auditLogRepository.recordAction({
      type: 'CONFIG_UPDATE',
      detail: changes.length > 0 ? `Perubahan konfigurasi: ${changes.join(', ')}` : 'Konfigurasi sistem diperbarui',
      ip: clientIp,
    });

    res.json({
      success: true,
      data: updatedConfig,
    });
  } catch (err: unknown) {
    console.error('[UPDATE_CONFIG_ERROR]', err);
    res.status(500).json({
      success: false,
      error: { code: 'CONFIG_UPDATE_FAILED', message: 'Gagal memperbarui konfigurasi sistem. Silakan coba lagi.' },
    });
  }
}

export async function toggleMaintenance(req: Request, res: Response): Promise<void> {
  try {
    const clientIp = getClientIp(req);
    let targetLevel: MaintenanceLevel;

    if (req.body?.level !== undefined) {
      const rawLevel = String(req.body.level).toLowerCase().trim();
      if (rawLevel !== 'off' && rawLevel !== 'upload_only' && rawLevel !== 'full_lockdown') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_MAINTENANCE_LEVEL',
            message: 'Level maintenance tidak valid. Nilai yang diterima: off, upload_only, full_lockdown.',
          },
        });
        return;
      }
      targetLevel = rawLevel as MaintenanceLevel;
    } else if (req.body?.enabled !== undefined) {
      targetLevel = Boolean(req.body.enabled) ? 'upload_only' : 'off';
    } else {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_LEVEL_OR_ENABLED',
          message: 'Parameter level atau enabled wajib disertakan.',
        },
      });
      return;
    }

    await setMaintenanceLevel(targetLevel);

    let logDetail = '';
    if (targetLevel === 'full_lockdown') {
      logDetail = 'Kill Switch diubah ke: LOCKDOWN TOTAL — Seluruh unggahan publik dan akses share link ditolak (503)';
    } else if (targetLevel === 'upload_only') {
      logDetail = 'Kill Switch diubah ke: TUTUP UPLOAD SAJA — Seluruh unggahan baru ditolak (503), share link lama tetap aktif';
    } else {
      logDetail = 'Kill Switch DINONAKTIFKAN — Mode Pemeliharaan nonaktif, seluruh layanan berjalan normal';
    }

    await auditLogRepository.recordAction({
      type: 'MAINTENANCE_TOGGLE',
      detail: logDetail,
      ip: clientIp,
    });

    alertMaintenanceModeChanged(targetLevel, 'web', `IP ${clientIp}`).catch((alertErr) => {
      console.warn('[TELEGRAM_ALERT_WARN] Gagal mengirim alert maintenance mode:', alertErr);
    });

    res.json({
      success: true,
      maintenanceLevel: targetLevel,
      maintenanceMode: targetLevel !== 'off',
      message:
        targetLevel === 'full_lockdown'
          ? 'Mode Pemeliharaan aktif (Lockdown Total).'
          : targetLevel === 'upload_only'
          ? 'Mode Pemeliharaan aktif (Tutup Upload Saja).'
          : 'Mode Pemeliharaan dinonaktifkan (Layanan Normal).',
    });
  } catch (err: unknown) {
    console.error('[TOGGLE_MAINTENANCE_ERROR]', err);
    res.status(500).json({
      success: false,
      error: { code: 'MAINTENANCE_TOGGLE_FAILED', message: 'Gagal mengubah status mode pemeliharaan. Silakan coba lagi.' },
    });
  }
}

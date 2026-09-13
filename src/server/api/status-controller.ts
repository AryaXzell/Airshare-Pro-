import { Request, Response } from 'express';
import {
  getMaintenanceLevel,
  getAnnouncement,
  getFeatureFlags,
  AnnouncementBanner,
} from '../security/system-config';
import { checkCatboxHealth } from '../storage/catbox-health-check';
import { checkRedisHealth } from '../storage/redis-client';
import { SystemStatusData } from '../../types';
import { renderStatusPageHtml } from '../status-html';

export async function getSystemStatusData(): Promise<SystemStatusData> {
  const [maintenanceLevel, rawAnnouncement, featureFlags, catboxHealth, redisHealth] =
    await Promise.all([
      getMaintenanceLevel(),
      getAnnouncement(),
      getFeatureFlags(),
      checkCatboxHealth(),
      checkRedisHealth(),
    ]);

  const activeAnnouncement: AnnouncementBanner | null =
    rawAnnouncement && rawAnnouncement.enabled && (!rawAnnouncement.expiresAt || rawAnnouncement.expiresAt > Date.now())
      ? rawAnnouncement
      : null;

  let overallStatus: 'operational' | 'degraded' | 'major_outage' = 'operational';
  let uploadStatus: 'operational' | 'maintenance' | 'degraded' = 'operational';
  let downloadStatus: 'operational' | 'maintenance' | 'degraded' = 'operational';
  let storageStatus: 'operational' | 'degraded' | 'outage' = 'operational';
  let databaseStatus: 'operational' | 'degraded' = 'operational';

  // Evaluate Storage (Catbox)
  if (!catboxHealth.available) {
    storageStatus = 'outage';
  } else if (catboxHealth.latencyMs && catboxHealth.latencyMs > 2500) {
    storageStatus = 'degraded';
  } else {
    storageStatus = 'operational';
  }

  // Evaluate Database (Redis)
  if (redisHealth.configured && !redisHealth.connected) {
    databaseStatus = 'degraded';
  } else {
    databaseStatus = 'operational';
  }

  // Evaluate Maintenance Level impact on Services
  if (maintenanceLevel === 'full_lockdown') {
    overallStatus = 'major_outage';
    uploadStatus = 'maintenance';
    downloadStatus = 'maintenance';
  } else if (maintenanceLevel === 'upload_only') {
    overallStatus = 'degraded';
    uploadStatus = 'maintenance';
    downloadStatus = storageStatus === 'outage' ? 'degraded' : 'operational';
  } else {
    // Normal / Off
    if (storageStatus === 'outage') {
      overallStatus = 'major_outage';
      uploadStatus = 'degraded';
      downloadStatus = 'degraded';
    } else if (storageStatus === 'degraded' || databaseStatus === 'degraded') {
      overallStatus = 'degraded';
      uploadStatus = 'operational';
      downloadStatus = 'operational';
    } else {
      overallStatus = 'operational';
      uploadStatus = 'operational';
      downloadStatus = 'operational';
    }
  }

  const nowIso = new Date().toISOString();

  return {
    status: overallStatus,
    maintenanceLevel,
    maintenanceMode: maintenanceLevel !== 'off',
    services: {
      upload: {
        status: uploadStatus,
        label: 'Unggah Berkas (Upload)',
        message:
          uploadStatus === 'maintenance'
            ? 'Unggahan baru dinonaktifkan sementara untuk pemeliharaan.'
            : uploadStatus === 'degraded'
            ? 'Unggahan mungkin mengalami perlambatan.'
            : 'Beroperasi normal hingga 100MB per berkas.',
      },
      download: {
        status: downloadStatus,
        label: 'Unduh & Berbagi Tautan (Download & Share Link)',
        message:
          downloadStatus === 'maintenance'
            ? 'Akses tautan berbagi ditutup sementara selama mode lockdown.'
            : downloadStatus === 'degraded'
            ? 'Akses unduhan mungkin mengalami latensi tinggi.'
            : 'Seluruh tautan berbagi dapat diakses secara publik tanpa hambatan.',
      },
      storage: {
        status: storageStatus,
        label: 'Penyimpanan Utama (Catbox Cluster)',
        latencyMs: catboxHealth.latencyMs ?? undefined,
        message:
          storageStatus === 'outage'
            ? 'Koneksi ke klaster penyimpanan upstream terputus.'
            : storageStatus === 'degraded'
            ? `Latensi upstream tinggi (${catboxHealth.latencyMs ?? 0} ms).`
            : `Terhubung & responsif (${catboxHealth.latencyMs ?? 0} ms).`,
      },
      database: {
        status: databaseStatus,
        label: 'Database & Konfigurasi (Upstash Redis)',
        latencyMs: redisHealth.latencyMs ?? undefined,
        message:
          databaseStatus === 'degraded'
            ? 'Redis tidak terhubung, sistem menggunakan fallback in-memory.'
            : `Terhubung persisten (${redisHealth.latencyMs ?? 0} ms).`,
      },
    },
    announcement: activeAnnouncement,
    featureFlags,
    uptime: {
      status: '99.9%',
      lastChecked: nowIso,
    },
    timestamp: nowIso,
  };
}

export const statusController = {
  async renderStatusPage(req: Request, res: Response): Promise<void> {
    try {
      res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.get('host') || 'airshare-pro.vercel.app';
      const siteRootUrl = `${protocol}://${host}/`;
      const canonicalUrl = `${protocol}://${host}/status`;

      const data = await getSystemStatusData();
      const html = renderStatusPageHtml(data, canonicalUrl, siteRootUrl);
      res.send(html);
    } catch (err: unknown) {
      console.error('[STATUS_PAGE_ERROR]', err);
      res.status(500).send(`<!DOCTYPE html>
<html>
<head><title>System Status Unavailable</title></head>
<body style="background:#0b0f17;color:#f8fafc;font-family:sans-serif;padding:2rem;text-align:center;">
  <h2>Gagal memuat halaman status</h2>
  <p style="color:#94a3b8;margin-top:0.5rem;">Terjadi kesalahan saat memeriksa kesehatan sistem.</p>
  <p style="margin-top:1.5rem;"><a href="/" style="color:#3b82f6;">Kembali ke Beranda</a></p>
</body>
</html>`);
    }
  },
};

export default statusController;

import { Request, Response } from 'express';
import {
  ADMIN_COOKIE_NAME,
  getAdminConfig,
  getAllActiveSessions,
} from '../security/admin-auth';
import { analyticsRepository, getTodayDateString } from '../repository/analytics-repository';
import { getMediaRepository } from '../repository/media-repository';
import { isUpstashConfigured, checkRedisHealth } from '../storage/redis-client';
import {
  checkCatboxHealth,
  getLastSyncCheck,
} from '../storage/catbox-health-check';
import { getAllSystemConfig } from '../security/system-config';
import { auditLogRepository } from '../repository/audit-log-repository';
import { deletedFilesRepository } from '../repository/deleted-files-repository';
import { notificationRepository } from '../repository/notification-repository';
import { renderAdminDashboardHtml } from '../admin-html/pages/dashboard-page';
import { generateRecommendations, GEMINI_MODEL_NAME } from './ai.actions';

export async function renderDashboard(req: Request, res: Response): Promise<void> {
  const { enabled, panelPath: fullAdminPath } = getAdminConfig();
  if (!enabled) {
    res.status(404).send('<!DOCTYPE html><html><body>404 Not Found</body></html>');
    return;
  }

  try {
    const todayStr = getTodayDateString();
    const currentToken = req.cookies?.[ADMIN_COOKIE_NAME];

    // Fetch parallel dashboard analytics metrics with real active health checks and operational state
    const [
      todayStats,
      weeklyTrend,
      rawTopFiles,
      recentUploads,
      totalItemsInRepo,
      catboxHealth,
      redisHealth,
      lastSyncCheck,
      systemConfig,
      activeSessions,
      auditLogs,
      deletedFiles,
      notifications,
      unreadNotificationsCount,
    ] = await Promise.all([
      analyticsRepository.getDailySummary(todayStr),
      analyticsRepository.getWeeklyTrend(),
      analyticsRepository.getTopFiles(10),
      analyticsRepository.getRecentUploads(50),
      analyticsRepository.getTotalItemsEver(),
      checkCatboxHealth(),
      checkRedisHealth(),
      getLastSyncCheck(),
      getAllSystemConfig(),
      getAllActiveSessions(currentToken),
      auditLogRepository.getRecentActions(50),
      deletedFilesRepository.getDeletedFiles(100),
      notificationRepository.getNotifications(60),
      notificationRepository.getUnreadCount(),
    ]);

    // Enhance top files with stored names and formatted sizes if available
    const mediaRepo = getMediaRepository();
    const topFiles = await Promise.all(
      rawTopFiles.map(async (tf) => {
        const item = await mediaRepo.getByIdPublic(tf.id);
        return {
          id: tf.id,
          name: item?.name || tf.id,
          views: tf.views,
          formattedSize: item?.formattedSize || '-',
          type: item?.type || 'file',
          shareUrl: item?.shareUrl || '#',
        };
      })
    );

    // Enhance recent uploads with individual view counts (STRICT SECURITY: no sessionId)
    const enhancedRecentUploads = await Promise.all(
      recentUploads.map(async (u) => {
        const views = await analyticsRepository.getViewCount(u.id);
        return {
          ...u,
          views,
        };
      })
    );

    // System health metrics
    const redisConnected = redisHealth.connected;
    const storageMode = isUpstashConfigured()
      ? (redisConnected ? 'Upstash Redis (Terdistribusi)' : 'Upstash Redis (Terputus / Gangguan)')
      : 'In-Memory (Fallback)';
    const uptimeSeconds = Math.floor(process.uptime());
    const uptimeFormatted = `${Math.floor(uptimeSeconds / 3600)}j ${Math.floor(
      (uptimeSeconds % 3600) / 60
    )}m ${uptimeSeconds % 60}d`;

    const initialDate = new Date();
    const initialTimeFormatted = `${String(initialDate.getHours()).padStart(2, '0')}:${String(
      initialDate.getMinutes()
    ).padStart(2, '0')}:${String(initialDate.getSeconds()).padStart(2, '0')}`;

    // Generate automated recommendations
    const recommendations = generateRecommendations(todayStats, weeklyTrend, topFiles);

    // Security response headers
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    const html = renderAdminDashboardHtml({
      fullAdminPath,
      initialTimeFormatted,
      todayStats,
      weeklyTrend,
      totalItemsInRepo,
      enhancedRecentUploads,
      topFiles,
      deletedFiles,
      recommendations,
      storageMode,
      redisConnected,
      isUpstashConfigured: isUpstashConfigured(),
      catboxHealth,
      uptimeFormatted,
      initialDate,
      geminiModelName: GEMINI_MODEL_NAME,
      systemConfig,
      lastSyncCheck,
      activeSessions,
      auditLogs,
      notifications,
      unreadNotificationsCount,
    });

    res.status(200).send(html);
  } catch (err: unknown) {
    console.error('[RENDER_DASHBOARD_ERROR]', err);
    res.status(500).send('<!DOCTYPE html><html><body><h1>500 Internal Server Error</h1><p>Gagal memuat dashboard admin. Silakan periksa koneksi dan coba beberapa saat lagi.</p></body></html>');
  }
}

export async function getLiveStats(req: Request, res: Response): Promise<void> {
  const { enabled } = getAdminConfig();
  if (!enabled) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
    return;
  }

  try {
    const todayStr = getTodayDateString();

    const [
      todayStats,
      totalItemsInRepo,
      redisHealth,
      catboxHealth,
      recentUploads,
    ] = await Promise.all([
      analyticsRepository.getDailySummary(todayStr),
      analyticsRepository.getTotalItemsEver(),
      checkRedisHealth(),
      checkCatboxHealth(),
      analyticsRepository.getRecentUploads(10),
    ]);

    const enhancedRecentUploads = await Promise.all(
      recentUploads.map(async (u) => {
        const views = await analyticsRepository.getViewCount(u.id);
        return {
          id: u.id,
          name: u.name,
          type: u.type,
          size: u.size,
          formattedSize: u.formattedSize,
          uploaderCountryCode: u.uploaderCountryCode,
          createdAt: u.createdAt,
          views,
        };
      })
    );

    const storageMode = isUpstashConfigured()
      ? (redisHealth.connected ? 'Upstash Redis (Terdistribusi)' : 'Upstash Redis (Terputus / Gangguan)')
      : 'In-Memory (Fallback)';

    const uptimeSecs = Math.floor(process.uptime());
    const uptimeFormatted = `${Math.floor(uptimeSecs / 3600)}j ${Math.floor((uptimeSecs % 3600) / 60)}m ${uptimeSecs % 60}d`;

    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      today: todayStats,
      totalItemsInRepo,
      uptimeFormatted,
      redis: {
        configured: redisHealth.configured,
        connected: redisHealth.connected,
        latencyMs: redisHealth.latencyMs,
        mode: storageMode,
      },
      catbox: {
        available: catboxHealth.available,
        latencyMs: catboxHealth.latencyMs,
      },
      recentUploads: enhancedRecentUploads,
    });
  } catch (err: unknown) {
    console.error('[GET_LIVE_STATS_ERROR]', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Gagal memuat statistik live dashboard. Silakan coba lagi.' },
    });
  }
}

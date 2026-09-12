import { Request, Response } from 'express';
import {
  ADMIN_COOKIE_NAME,
  checkAdminLoginRateLimit,
  createAdminSession,
  destroyAdminSession,
  getAdminConfig,
  verifyAdminPassword,
  verifyAdminSession,
  getAllActiveSessions,
  revokeAdminSession,
  revokeAllAdminSessions,
} from '../security/admin-auth';
import { analyticsRepository, getTodayDateString } from '../repository/analytics-repository';
import { getMediaRepository } from '../repository/media-repository';
import { isUpstashConfigured, checkRedisHealth } from '../storage/redis-client';
import {
  checkCatboxHealth,
  verifyFilesBatch,
  getLastSyncCheck,
  saveLastSyncCheck,
  removeSyncCheckItem,
  SyncCheckSummary,
} from '../storage/catbox-health-check';
import { CatboxStorageProvider } from '../storage/catbox-storage-provider';
import {
  getAllSystemConfig,
  setMaintenanceMode,
  setMaintenanceLevel,
  MaintenanceLevel,
  setAnnouncement,
  clearAnnouncement,
  setMaxUploadSize,
  setUploadRateLimit,
  setFeatureFlags,
  AnnouncementConfig,
  SystemConfig,
} from '../security/system-config';
import { auditLogRepository } from '../repository/audit-log-repository';
import { getClientIp } from '../security/client-ip';
import {
  renderOperationalControlsHtml,
  renderActiveSessionsHtml,
  renderBulkCleanupHtml,
  renderAuditLogsHtml,
  getOperationalPanelStyles,
  getOperationalPanelScripts,
} from './admin-operational-panel';
import {
  GOOGLE_FONTS_TAGS,
  THEME_HEAD_SCRIPT,
  THEME_BODY_SCRIPT,
  THEME_STORAGE_LISTENER_SCRIPT,
  THEME_CSS_VARIABLES,
} from './theme-styles';
import {
  alertAdminLoginFailed,
  alertMaintenanceModeChanged,
} from '../telegram/telegram-notifier';
import { DailyStats, PublicMediaView, WeeklyTrendItem, DeletedFileRecord } from '../../types';
import { deletedFilesRepository } from '../repository/deleted-files-repository';
import { getFlagAssetPath } from '../../shared/flags';

const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

const storageProvider = new CatboxStorageProvider();

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return 'Baru saja';
  const diffMs = Date.now() - timestamp;
  const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSecs < 60) return 'Baru saja';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m lalu`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}j lalu`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}h lalu`;
}

function formatAbsoluteTime(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return '-';
  const d = new Date(timestamp);
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function renderSyncSummaryHtml(check: SyncCheckSummary | null): string {
  if (!check) {
    return `
      <div class="sync-banner sync-banner-idle">
        <div>
          <strong>Status Sinkronisasi: Belum Pernah Diperiksa</strong>
          <div style="font-size: 0.8rem; margin-top: 0.25rem; color: var(--muted);">Klik tombol &quot;Jalankan Pemeriksaan Sinkronisasi&quot; di atas untuk memverifikasi apakah berkas yang tercatat di Redis masih benar-benar aktif di server Catbox.</div>
        </div>
      </div>`;
  }

  if (check.brokenCount === 0) {
    return `
      <div class="sync-banner sync-banner-ok">
        <div>
          <strong>Semua Berkas Tersinkronisasi Aktif!</strong>
          <div style="font-size: 0.8rem; margin-top: 0.25rem;">${check.totalChecked} dari ${check.totalChecked} berkas terbaru berhasil diverifikasi aktif di server Catbox (HTTP 200 OK). Tidak ada berkas yatim/rusak yang terdeteksi.</div>
        </div>
      </div>`;
  }

  return `
    <div class="sync-banner sync-banner-warn" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
      <div>
        <strong>Ditemukan Berkas Bermasalah: ${check.brokenCount} Berkas Rusak / Yatim!</strong>
        <div style="font-size: 0.8rem; margin-top: 0.25rem;">${check.healthyCount} dari ${check.totalChecked} berkas aktif. Terdapat <strong>${check.brokenCount} tautan berkas</strong> yang sudah tidak ditemukan di Catbox (404/Error). Anda dapat membersihkannya dari riwayat di bawah.</div>
      </div>
      <button type="button" id="btn-purge-all-broken" style="background: #ef4444; color: #fff; border: none; padding: 0.45rem 1rem; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer; white-space: nowrap;">
        Bersihkan Semua ${check.brokenCount} Berkas Rusak (404)
      </button>
    </div>
    <div class="table-container" style="margin-top: 1rem;">
      <table>
        <thead>
          <tr>
            <th>Berkas Bermasalah</th>
            <th>Ukuran</th>
            <th>Tautan Catbox Asli</th>
            <th>Waktu Unggah</th>
            <th>Aksi Perbaikan</th>
          </tr>
        </thead>
        <tbody id="sync-broken-tbody">
          ${check.brokenItems
            .map(
              (item) => `
            <tr id="sync-row-${escapeHtml(item.id)}">
              <td>
                <div style="font-weight: 700; color: #f87171; max-width: clamp(120px, 40vw, 220px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(
                  item.name
                )}">
                  ${escapeHtml(item.name)}
                </div>
                <div style="font-size: 0.7rem; color: var(--muted);">${escapeHtml(item.id)}</div>
              </td>
              <td style="font-weight: 600;">${escapeHtml(item.formattedSize)}</td>
              <td>
                <a href="${escapeHtml(
                  item.shareUrl
                )}" target="_blank" class="link-view" style="font-size: 0.75rem; color: var(--muted); max-width: clamp(120px, 40vw, 220px); display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${escapeHtml(item.shareUrl)}
                </a>
              </td>
              <td>
                <div style="font-size: 0.8rem; font-weight: 600;">${formatRelativeTime(
                  item.createdAt
                )}</div>
              </td>
              <td>
                <button type="button" class="btn-delete-history" data-id="${escapeHtml(
                  item.id
                )}" data-name="${escapeHtml(item.name)}">Hapus dari Riwayat</button>
              </td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/**
 * Pure function: Generates data-driven conditional recommendations
 * based on current analytics without altering page structure.
 */
export function generateRecommendations(
  stats: DailyStats,
  weeklyTrend: WeeklyTrendItem[],
  topFiles: { id: string; name?: string; views: number }[],
  maxUploadSize = 209715200 // 200MB
): string[] {
  const recommendations: string[] = [];

  // 1. Average file size check
  if (stats.uploads > 0 && stats.averageFileSize > maxUploadSize * 0.5) {
    recommendations.push(
      `Rata-rata ukuran file hari ini (${stats.formattedAverageSize}) mendekati ambang batas kapasitas 200 MB. Pertimbangkan menaikkan batas upload atau mengoptimalkan kompresi sisi klien pada format video/audio.`
    );
  }

  // 2. Outlier view check on popular files
  if (topFiles.length > 0 && topFiles[0].views > 50) {
    const top = topFiles[0];
    const totalViews = stats.totalViews || 1;
    if (top.views > totalViews * 0.4 || top.views >= 100) {
      recommendations.push(
        `Berkas "${escapeHtml(top.name || top.id)}" sangat populer dengan ${top.views} tayangan. Pertimbangkan integrasi CDN edge caching tambahan atau rate limit tayangan yang lebih ketat guna mencegah lonjakan pemakaian bandwidth Catbox.`
      );
    }
  }

  // 3. Country dominance check (>70%)
  const totalCountryUploads = Object.values(stats.byCountry).reduce((sum, count) => sum + count, 0);
  if (totalCountryUploads >= 5) {
    for (const [code, count] of Object.entries(stats.byCountry)) {
      if (code !== 'UNKNOWN' && count / totalCountryUploads > 0.7) {
        recommendations.push(
          `Lebih dari 70% (${Math.round((count / totalCountryUploads) * 100)}%) unggahan hari ini berasal dari negara ${code}. Pertimbangkan menambahkan CDN atau server edge region yang lebih dekat dengan basis pengguna utama Anda.`
        );
        break;
      }
    }
  }

  // 4. Weekly trend comparison
  if (weeklyTrend.length >= 4) {
    const pastDays = weeklyTrend.slice(0, weeklyTrend.length - 1);
    const pastUploadsSum = pastDays.reduce((sum, d) => sum + d.uploads, 0);
    const avgPastUploads = pastDays.length > 0 ? pastUploadsSum / pastDays.length : 0;

    if (avgPastUploads >= 5 && stats.uploads < avgPastUploads * 0.4) {
      recommendations.push(
        `Aktivitas unggahan hari ini (${stats.uploads}) terpantau menurun signifikan dibanding rata-rata 7 hari terakhir (${Math.round(avgPastUploads)} unggahan/hari). Pertimbangkan meninjau kanal distribusi atau promosi platform.`
      );
    }
  }

  // Default baseline recommendation if none triggered
  if (recommendations.length === 0) {
    recommendations.push(
      'Semua metrik sistem berjalan dalam batas normal. Rasio ukuran berkas dan lalu lintas tayangan dalam kondisi sehat.'
    );
    recommendations.push(
      'Koneksi penyimpanan Catbox dan basis data analitik beroperasi dengan latensi optimal.'
    );
  }

  return recommendations;
}

export const adminController = {
  /**
   * GET /{ADMIN_PANEL_PATH}/login
   */
  async renderLoginPage(req: Request, res: Response): Promise<void> {
    try {
      const { enabled, panelPath: fullAdminPath } = getAdminConfig();
    if (!enabled) {
      res.status(404).send('<!DOCTYPE html><html><body>404 Not Found</body></html>');
      return;
    }

    // Check if already authenticated
    const token = req.cookies?.[ADMIN_COOKIE_NAME];
    if (token && (await verifyAdminSession(token))) {
      res.redirect(`/${fullAdminPath}/dashboard`);
      return;
    }

    const errorParam = req.query.error as string;
    const retryAfter = req.query.retryAfter as string;

    let errorMessage = '';
    if (errorParam === 'invalid') {
      errorMessage = 'Kredensial tidak valid. Silakan coba kembali.';
    } else if (errorParam === 'rate_limited') {
      errorMessage = `Terlalu banyak percobaan login gagal. Silakan tunggu ${
        retryAfter ? `${retryAfter} detik` : 'beberapa saat'
      } sebelum mencoba kembali.`;
    }

    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin Authentication — AirShare Pro</title>
  ${GOOGLE_FONTS_TAGS}
  ${THEME_HEAD_SCRIPT}
  <style>
    ${THEME_CSS_VARIABLES}

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-sans);
      background-color: var(--bg-primary);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      transition: background-color 0.25s ease, color 0.25s ease;
    }
    .glass-card {
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 1.5rem;
      padding: 2.25rem;
      max-width: 420px;
      width: 100%;
      box-shadow: var(--shadow-modal);
    }
    .header { text-align: center; margin-bottom: 2rem; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: var(--accent-soft);
      color: var(--accent);
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 1rem;
      border: 1px solid var(--border-subtle);
    }
    h1 { font-size: 1.35rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 0.35rem; color: var(--text-main); }
    p.subtitle { color: var(--text-muted); font-size: 0.85rem; line-height: 1.4; }
    .error-banner {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
      padding: 0.75rem 1rem;
      border-radius: 0.75rem;
      font-size: 0.825rem;
      margin-bottom: 1.25rem;
      line-height: 1.4;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .form-group { margin-bottom: 1.25rem; }
    label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.5rem; }
    input[type="password"] {
      width: 100%;
      background: var(--surface-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 0.75rem;
      padding: 0.8rem 1rem;
      color: var(--text-main);
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input[type="password"]:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--border-focus);
    }
    .btn-submit {
      width: 100%;
      background: var(--accent);
      color: var(--accent-text, #fff);
      border: none;
      border-radius: 0.75rem;
      padding: 0.85rem 1rem;
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .btn-submit:hover { background: var(--accent-hover); }
    .footer-note {
      margin-top: 1.5rem;
      text-align: center;
      font-size: 0.725rem;
      color: var(--text-muted);
      opacity: 0.85;
    }
  </style>
</head>
<body class="theme-rosegold">
  ${THEME_BODY_SCRIPT}
  <div class="glass-card">
    <div class="header">
      <div class="badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Panel Terenkripsi
      </div>
      <h1>AirShare Pro Admin</h1>
      <p class="subtitle">Masukkan kunci otorisasi rahasia untuk memuat analitik sistem.</p>
    </div>

    ${
      errorMessage
        ? `<div class="error-banner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>${escapeHtml(errorMessage)}</span>
          </div>`
        : ''
    }

    <form method="POST" action="/${escapeHtml(fullAdminPath)}/login">
      <div class="form-group">
        <label for="password">Kunci Sandi Admin (ADMIN_SECRET_KEY)</label>
        <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="••••••••••••••••" autofocus />
      </div>
      <button type="submit" class="btn-submit">Buka Dashboard</button>
    </form>

    <div class="footer-note">
      Bcrypt Salting Cost 12 • Strict Session TTL 1 Jam • IP Rate Limited
    </div>
  </div>

  <script>
    ${THEME_STORAGE_LISTENER_SCRIPT}
  </script>
</body>
</html>`;

    res.status(200).send(html);
    } catch (err: any) {
      console.error('[ADMIN_RENDER_LOGIN_ERROR]', err);
      res.status(500).send('<!DOCTYPE html><html><body><h1>500 Internal Server Error</h1><p>Gagal memuat halaman login admin.</p></body></html>');
    }
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/login
   */
  async handleLogin(req: Request, res: Response): Promise<void> {
    const { enabled, panelPath: fullAdminPath } = getAdminConfig();
    if (!enabled) {
      res.status(404).send('<!DOCTYPE html><html><body>404 Not Found</body></html>');
      return;
    }

    try {
      const clientIp = getClientIp(req);

      // 1. Strict rate limit check (5 attempts per 15 mins per IP)
      const rateLimit = await checkAdminLoginRateLimit(req);
      if (!rateLimit.allowed) {
        console.warn(`[ADMIN_LOGIN_RATE_LIMITED] IP ${clientIp} exceeded login attempts`);
        await auditLogRepository.recordAction({
          type: 'ADMIN_LOGIN_RATE_LIMITED',
          detail: `IP ${clientIp} terkena batasan rate limit login admin`,
          ip: clientIp,
        });
        alertAdminLoginFailed(clientIp).catch((alertErr) => {
          console.warn('[TELEGRAM_ALERT_WARN] Gagal mengirim alert login admin gagal:', alertErr);
        });
        res.redirect(`/${fullAdminPath}/login?error=rate_limited&retryAfter=${rateLimit.retryAfterSeconds}`);
        return;
      }

      const password = req.body?.password;
      if (!password || typeof password !== 'string') {
        res.redirect(`/${fullAdminPath}/login?error=invalid`);
        return;
      }

      // 2. Verify password with bcrypt hashing
      const isValid = await verifyAdminPassword(password);
      if (!isValid) {
        console.warn(`[ADMIN_LOGIN_FAILED] Percobaan login admin gagal pada ${new Date().toISOString()}`);
        await auditLogRepository.recordAction({
          type: 'ADMIN_LOGIN_FAILED',
          detail: 'Percobaan login admin gagal dengan sandi tidak valid',
          ip: clientIp,
        });
        res.redirect(`/${fullAdminPath}/login?error=invalid`);
        return;
      }

      // 3. Create fresh admin session token with 1-hour TTL
      const sessionToken = await createAdminSession(req);
      console.info(`[ADMIN_LOGIN_SUCCESS] Sesi admin berhasil dibuat pada ${new Date().toISOString()}`);
      await auditLogRepository.recordAction({
        type: 'ADMIN_LOGIN',
        detail: 'Login berhasil ke panel kontrol admin',
        ip: clientIp,
        adminTokenPreview: `${sessionToken.substring(0, 8)}...`,
      });

      // 4. Set HttpOnly secure cookie
      res.cookie(ADMIN_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600 * 1000, // 1 hour
        path: '/',
      });

      res.redirect(`/${fullAdminPath}/dashboard`);
    } catch (err: unknown) {
      console.error('[HANDLE_LOGIN_ERROR]', err);
      res.redirect(`/${fullAdminPath}/login?error=invalid`);
    }
  },

  /**
   * POST / GET /{ADMIN_PANEL_PATH}/logout
   */
  async handleLogout(req: Request, res: Response): Promise<void> {
    const { enabled, panelPath: fullAdminPath } = getAdminConfig();
    if (!enabled) {
      res.status(404).send('<!DOCTYPE html><html><body>404 Not Found</body></html>');
      return;
    }

    try {
      const clientIp = getClientIp(req);
      const token = req.cookies?.[ADMIN_COOKIE_NAME];
      if (token) {
        await destroyAdminSession(token);
      }

      await auditLogRepository.recordAction({
        type: 'ADMIN_LOGOUT',
        detail: 'Admin keluar dari sesi',
        ip: clientIp,
        adminTokenPreview: token ? `${token.substring(0, 8)}...` : undefined,
      });

      res.clearCookie(ADMIN_COOKIE_NAME, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
      });

      res.redirect(`/${fullAdminPath}/login`);
    } catch (err: unknown) {
      console.error('[HANDLE_LOGOUT_ERROR]', err);
      res.clearCookie(ADMIN_COOKIE_NAME, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
      });
      res.redirect(`/${fullAdminPath}/login`);
    }
  },

  /**
   * GET /{ADMIN_PANEL_PATH}/dashboard
   */
  async renderDashboard(req: Request, res: Response): Promise<void> {
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

    // Prepare media type breakdown percentages
    const totalUploadedToday = todayStats.uploads || 0;
    const typeCounts = {
      image: todayStats.byType['image'] || 0,
      video: todayStats.byType['video'] || 0,
      audio: todayStats.byType['audio'] || 0,
      file: todayStats.byType['file'] || 0,
    };

    // Prepare country list sorted descending
    const sortedCountries = Object.entries(todayStats.byCountry)
      .sort((a, b) => b[1] - a[1]);

    // Calculate maximum values for 7-day SVG chart scaling
    const maxDailyUploads = Math.max(1, ...weeklyTrend.map((d) => d.uploads));
    const maxDailyBytes = Math.max(1, ...weeklyTrend.map((d) => d.bytes));

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AirShare Pro — Analytics &amp; Admin Dashboard</title>
  ${GOOGLE_FONTS_TAGS}
  ${THEME_HEAD_SCRIPT}
  <style>
    ${THEME_CSS_VARIABLES}

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-sans);
      background-color: var(--bg-primary);
      color: var(--text-main);
      padding: 1.25rem;
      min-height: 100vh;
      transition: background-color 0.25s ease, color 0.25s ease;
    }
    .container { max-width: 1280px; margin: 0 auto; }

    /* Header & Navigation */
    .top-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      padding: 1rem 1.5rem;
      background: var(--surface-glass);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      margin-bottom: 1.25rem;
    }
    .brand { display: flex; align-items: center; gap: 0.75rem; }
    .brand-logo {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #2563eb, #3b82f6);
      border-radius: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    }
    .brand-text h1 { font-size: 1.15rem; font-weight: 800; letter-spacing: -0.01em; }
    .brand-text p { font-size: 0.75rem; color: var(--muted); }
    .nav-actions { display: flex; align-items: center; gap: 0.75rem; }
    .live-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      background: rgba(16, 185, 129, 0.12);
      color: var(--success);
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.4rem 0.85rem;
      border-radius: 9999px;
      border: 1px solid rgba(16, 185, 129, 0.25);
    }
    .live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); box-shadow: 0 0 8px var(--success); flex-shrink: 0; }
    .live-sync-texts { display: flex; flex-direction: column; text-align: left; }
    .live-sync-title { font-size: 0.75rem; font-weight: 700; line-height: 1.2; }
    .live-sync-time { font-size: 0.65rem; color: var(--muted); font-weight: 500; }
    .btn-logout {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 0.45rem 0.9rem;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: background-color 0.2s, color 0.2s;
    }
    .btn-logout:hover { background: rgba(239, 68, 68, 0.2); color: #f87171; border-color: rgba(239, 68, 68, 0.3); }

    /* Layout & Sidebar Nav */
    .admin-layout {
      display: flex;
      gap: 1.5rem;
      align-items: flex-start;
    }
    .admin-sidebar {
      width: 240px;
      flex-shrink: 0;
      position: sticky;
      top: 1.25rem;
      max-height: calc(100vh - 2.5rem);
      overflow-y: auto;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 0.85rem;
      box-shadow: var(--shadow-subtle);
    }
    .sidebar-title {
      font-size: 0.7rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      padding: 0.45rem 0.65rem 0.65rem;
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 0.5rem;
    }
    .sidebar-nav {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .admin-sidebar-btn {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      text-align: left;
      padding: 0.65rem 0.75rem;
      border-radius: 0.75rem;
      border: 1px solid transparent;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .admin-sidebar-btn:hover {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text);
    }
    .admin-sidebar-btn.active {
      background: var(--accent-soft);
      border-color: var(--border-accent);
      color: #60a5fa;
    }
    .admin-sidebar-btn.active .sidebar-btn-title {
      color: #60a5fa;
    }
    .sidebar-btn-icon {
      width: 32px;
      height: 32px;
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.04);
      flex-shrink: 0;
      color: inherit;
      transition: background 0.15s ease;
    }
    .admin-sidebar-btn.active .sidebar-btn-icon {
      background: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
    }
    .sidebar-btn-content {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .sidebar-btn-title {
      font-size: 0.825rem;
      font-weight: 700;
      line-height: 1.25;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sidebar-btn-desc {
      font-size: 0.675rem;
      color: var(--muted);
      line-height: 1.2;
      margin-top: 0.15rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .admin-main {
      flex: 1;
      min-width: 0;
    }

    /* Mobile Category Tabs */
    .admin-mobile-tabs {
      display: none;
      gap: 0.5rem;
      overflow-x: auto;
      padding-bottom: 0.75rem;
      margin-bottom: 1rem;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-x;
      scrollbar-width: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .admin-mobile-tabs::-webkit-scrollbar {
      display: none;
    }
    .admin-tab-btn {
      flex-shrink: 0;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.55rem 0.95rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--muted);
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      -webkit-user-select: none;
    }
    .admin-tab-btn:hover {
      background: rgba(255, 255, 255, 0.06);
      color: var(--text);
    }
    .admin-tab-btn:active {
      transform: scale(0.96);
      background: rgba(255, 255, 255, 0.1);
    }
    .admin-tab-btn.active {
      background: var(--accent);
      color: #ffffff;
      border-color: var(--accent);
      font-weight: 700;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.35);
    }
    .admin-sidebar-btn {
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      -webkit-user-select: none;
      cursor: pointer;
    }
    .admin-sidebar-btn:active {
      transform: scale(0.98);
      background: rgba(255, 255, 255, 0.08);
    }

    /* Category Panel Toggle */
    .category-panel {
      display: none;
    }
    .category-panel.active {
      display: block;
      animation: fadeIn 0.2s ease-in-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Summary Metric Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .metric-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 1.25rem 1.5rem;
      position: relative;
      overflow: hidden;
      box-shadow: var(--shadow-subtle);
    }
    .metric-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
    .metric-label { font-size: 0.8rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .metric-icon { width: 32px; height: 32px; border-radius: 0.6rem; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.05); color: var(--accent); }
    .metric-value { font-size: 1.85rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 0.25rem; }
    .metric-sub { font-size: 0.75rem; color: var(--muted); }

    /* Split Section Layout */
    .section-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 1.25rem;
      margin-bottom: 1.5rem;
    }

    .panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 1.5rem;
      box-shadow: var(--shadow-subtle);
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.85rem;
    }
    .panel-title { font-size: 1rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem; }
    .panel-badge { font-size: 0.75rem; color: var(--muted); }

    /* SVG Chart */
    .chart-container { width: 100%; height: 180px; position: relative; margin-top: 1rem; }
    .chart-bars { display: flex; align-items: flex-end; justify-content: space-between; height: 140px; gap: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }
    .chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
    .chart-bar { width: 100%; max-width: 32px; background: linear-gradient(180deg, var(--accent), var(--accent-dark)); border-radius: 6px 6px 0 0; min-height: 4px; transition: height 0.3s; }
    .chart-date { font-size: 0.65rem; color: var(--muted); margin-top: 0.4rem; text-align: center; }
    .chart-tooltip-label { font-size: 0.7rem; font-weight: 700; color: var(--text); margin-bottom: 0.2rem; }

    /* Distribution Progress */
    .dist-item { margin-bottom: 1rem; }
    .dist-header { display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600; margin-bottom: 0.35rem; }
    .dist-bar-track { width: 100%; height: 8px; background: rgba(255, 255, 255, 0.06); border-radius: 9999px; overflow: hidden; }
    .dist-bar-fill { height: 100%; border-radius: 9999px; }

    /* Country List */
    .country-row { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.04); font-size: 0.85rem; }
    .country-info { display: flex; align-items: center; gap: 0.6rem; }
    .country-flag { width: 20px; height: 14px; object-fit: cover; border-radius: 2px; }

    /* Gemini AI Recommendations & Real-Time Summary Box */
    .ai-rec-box {
      background: linear-gradient(180deg, rgba(37, 99, 235, 0.1) 0%, rgba(30, 58, 138, 0.04) 100%);
      border: 1px solid rgba(59, 130, 246, 0.28);
      border-radius: 1.25rem;
      padding: 1.35rem 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(59, 130, 246, 0.08);
      position: relative;
      overflow: hidden;
    }
    .ai-rec-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid rgba(59, 130, 246, 0.15);
    }
    .ai-rec-title-group {
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }
    .ai-rec-sparkle-icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
      flex-shrink: 0;
    }
    .ai-rec-title {
      font-size: 0.975rem;
      font-weight: 800;
      color: #e0f2fe;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .ai-rec-actions {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .ai-badge-model {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.7rem;
      font-weight: 700;
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid rgba(59, 130, 246, 0.35);
      color: #93c5fd;
      padding: 0.2rem 0.55rem;
      border-radius: 9999px;
      letter-spacing: 0.02em;
    }
    .ai-badge-pulse {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #60a5fa;
      box-shadow: 0 0 6px #60a5fa;
      animation: pulseDot 2s infinite ease-in-out;
    }
    @keyframes pulseDot {
      0%, 100% { opacity: 0.4; transform: scale(0.9); }
      50% { opacity: 1; transform: scale(1.2); }
    }
    .btn-ai-refresh {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #e2e8f0;
      border-radius: 8px;
      padding: 0.35rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.2s ease;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }
    .btn-ai-refresh:hover {
      background: rgba(59, 130, 246, 0.2);
      border-color: rgba(59, 130, 246, 0.4);
      color: #ffffff;
    }
    .btn-ai-refresh:active {
      transform: scale(0.95);
    }
    .btn-ai-refresh:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* AI Executive Summary Card */
    .ai-summary-card {
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-left: 3px solid #3b82f6;
      border-radius: 10px;
      padding: 0.95rem 1.15rem;
      margin-bottom: 1rem;
      font-size: 0.85rem;
      line-height: 1.6;
      color: #f1f5f9;
    }
    .ai-summary-label {
      font-size: 0.725rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #60a5fa;
      margin-bottom: 0.35rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    /* Recommendations List */
    .ai-recs-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      padding: 0;
      margin: 0;
    }
    .ai-list-item {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      font-size: 0.85rem;
      line-height: 1.55;
      color: #e2e8f0;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      padding: 0.65rem 0.85rem;
      border-radius: 8px;
    }
    .ai-bullet {
      color: #60a5fa;
      flex-shrink: 0;
      font-size: 0.85rem;
      margin-top: 0.15rem;
    }
    .ai-num-badge {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(59, 130, 246, 0.2);
      color: #93c5fd;
      font-size: 0.7rem;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 0.15rem;
    }
    .ai-item-body {
      flex: 1;
      min-width: 0;
    }
    .ai-bold {
      font-weight: 700;
      color: #ffffff;
    }
    .ai-italic {
      font-style: italic;
      color: #93c5fd;
    }
    .ai-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.75rem;
      background: rgba(255, 255, 255, 0.08);
      color: #fde047;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .ai-heading-3 {
      font-size: 0.9rem;
      font-weight: 700;
      color: #93c5fd;
      margin: 0.5rem 0 0.25rem;
    }
    .ai-meta-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.9rem;
      padding-top: 0.75rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 0.725rem;
      color: var(--muted);
    }

    /* Custom Loading Skeleton */
    .ai-skeleton-container {
      display: none;
      flex-direction: column;
      gap: 0.85rem;
    }
    .ai-skeleton-status {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.8rem;
      color: #93c5fd;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    .ai-skeleton-pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #3b82f6;
      box-shadow: 0 0 8px #3b82f6;
      animation: pulseDot 1.2s infinite ease-in-out;
    }
    .skeleton-shimmer {
      background: linear-gradient(90deg, rgba(255, 255, 255, 0.03) 25%, rgba(255, 255, 255, 0.09) 50%, rgba(255, 255, 255, 0.03) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite linear;
      border-radius: 6px;
    }
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .skeleton-card {
      height: 74px;
      border-radius: 10px;
      width: 100%;
    }
    .skeleton-row {
      height: 44px;
      border-radius: 8px;
      width: 100%;
    }

    /* Error Notification Container */
    .ai-error-box {
      display: none;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.28);
      border-radius: 10px;
      padding: 1rem 1.25rem;
      margin-top: 0.5rem;
    }
    .ai-error-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #f87171;
      font-size: 0.85rem;
      font-weight: 700;
      margin-bottom: 0.4rem;
    }
    .ai-error-desc {
      font-size: 0.8rem;
      color: #fca5a5;
      line-height: 1.5;
      margin-bottom: 0.85rem;
    }
    .ai-error-actions {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
    }
    .btn-ai-retry {
      background: #ef4444;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 0.35rem 0.85rem;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      touch-action: manipulation;
    }
    .btn-ai-fallback {
      background: rgba(255, 255, 255, 0.06);
      color: #e2e8f0;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 6px;
      padding: 0.35rem 0.85rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      touch-action: manipulation;
    }

    /* Tables */
    .table-container {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin-top: 0.5rem;
      border-radius: 0.75rem;
      border: 1px solid var(--border);
      background: rgba(0, 0, 0, 0.18);
      position: relative;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }
    .table-container::-webkit-scrollbar {
      height: 6px;
      width: 6px;
    }
    .table-container::-webkit-scrollbar-track {
      background: transparent;
    }
    .table-container::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 9999px;
    }
    table {
      width: 100%;
      min-width: 600px;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.85rem;
    }
    th {
      padding: 0.75rem 0.9rem;
      font-size: 0.725rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    td {
      padding: 0.75rem 0.9rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      vertical-align: middle;
    }
    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }
    .badge-type { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 6px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
    .badge-image { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .badge-video { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
    .badge-audio { background: rgba(236, 72, 153, 0.15); color: #f472b6; }
    .badge-file { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .session-tag { font-family: monospace; font-size: 0.75rem; color: var(--muted); background: rgba(255, 255, 255, 0.05); padding: 0.15rem 0.4rem; border-radius: 4px; }
    .link-view { color: var(--accent); text-decoration: none; font-weight: 600; }
    .link-view:hover { text-decoration: underline; }

    /* iOS Alert & Confirmation Modal (Super Lightweight, No Backdrop-Blur) */
    .ios-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
      opacity: 0;
      visibility: hidden;
      pointer-events: none; /* CRITICAL FIX: prevents touch blocking when modal is not active */
      transition: opacity 0.18s ease, visibility 0.18s ease;
    }
    .ios-modal-overlay.active {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
    }
    .ios-modal-box {
      background: #18181b;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 14px;
      width: 100%;
      max-width: 320px;
      box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.04);
      text-align: center;
      overflow: hidden;
      transform: scale(0.92);
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .ios-modal-overlay.active .ios-modal-box {
      transform: scale(1);
    }
    .ios-modal-body-content {
      padding: 1.35rem 1.15rem 1.15rem;
    }
    .ios-modal-icon-badge {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      margin: 0 auto 0.85rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ios-modal-icon-danger {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .ios-modal-icon-warning {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .ios-modal-icon-info {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .ios-modal-icon-success {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .ios-modal-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.3;
      margin-bottom: 0.45rem;
    }
    .ios-modal-desc {
      font-size: 0.825rem;
      color: #a1a1aa;
      line-height: 1.45;
      word-break: break-word;
      white-space: pre-line;
    }
    .ios-modal-actions-row {
      display: flex;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
    }
    .ios-modal-btn {
      flex: 1;
      background: transparent;
      border: none;
      font-size: 0.95rem;
      padding: 0.85rem 0.5rem;
      cursor: pointer;
      transition: background 0.15s ease;
      outline: none;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      font-family: inherit;
    }
    .ios-modal-btn:active, .ios-modal-btn:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .ios-modal-btn-cancel {
      color: #94a3b8;
      font-weight: 500;
      border-right: 1px solid rgba(255, 255, 255, 0.12);
    }
    .ios-modal-btn-danger {
      color: #f87171;
      font-weight: 700;
    }
    .ios-modal-btn-primary {
      color: #60a5fa;
      font-weight: 700;
    }

    /* Action buttons & Sync UI */
    .btn-delete-perm {
      background: rgba(239, 68, 68, 0.12);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: 6px;
      padding: 0.25rem 0.6rem;
      font-size: 0.725rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .btn-delete-perm:hover {
      background: rgba(239, 68, 68, 0.25);
      border-color: rgba(239, 68, 68, 0.4);
      color: #ffffff;
    }
    .btn-delete-perm:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-sync-action {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--accent);
      color: #ffffff;
      border: none;
      border-radius: 0.75rem;
      padding: 0.45rem 0.95rem;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s, opacity 0.2s;
    }
    .btn-sync-action:hover {
      background: #1d4ed8;
    }
    .btn-sync-action:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .sync-banner {
      padding: 1rem 1.25rem;
      border-radius: 0.75rem;
      font-size: 0.85rem;
      line-height: 1.5;
      margin-top: 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .sync-banner-ok {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: #34d399;
    }
    .sync-banner-warn {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.25);
      color: #f87171;
    }
    .sync-banner-idle {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      color: var(--muted);
    }
    .btn-delete-history {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 6px;
      padding: 0.25rem 0.6rem;
      font-size: 0.725rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .btn-delete-history:hover {
      background: rgba(245, 158, 11, 0.25);
      color: #ffffff;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Health footer */
    .health-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      padding: 1rem 1.5rem;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      font-size: 0.775rem;
      color: var(--muted);
      margin-top: 1.5rem;
      box-shadow: var(--shadow-subtle);
    }
    .health-item { display: flex; align-items: center; gap: 0.5rem; }
    .status-indicator { width: 8px; height: 8px; border-radius: 50%; }
    .status-ok { background: var(--success); box-shadow: 0 0 6px var(--success); }
    .status-warn { background: var(--warning); box-shadow: 0 0 6px var(--warning); }

    /* Media Queries */
    @media (max-width: 900px) {
      .admin-layout {
        display: block;
      }
      .admin-sidebar {
        display: none;
      }
      .admin-mobile-tabs {
        display: flex;
      }
      .section-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      body {
        padding: 0.75rem;
      }
      .top-nav {
        padding: 0.85rem 1rem;
        border-radius: 1rem;
        margin-bottom: 1rem;
      }
      .panel {
        padding: 1rem;
        border-radius: 1rem;
      }
      .metric-card {
        padding: 1rem 1.1rem;
        border-radius: 1rem;
      }
      .rec-box {
        padding: 1rem;
        border-radius: 1rem;
      }
      .health-bar {
        padding: 0.85rem 1rem;
        border-radius: 1rem;
      }
    }

    ${getOperationalPanelStyles()}
  </style>
</head>
<body class="theme-rosegold">
  ${THEME_BODY_SCRIPT}
  <div class="container">
    <!-- Top Nav -->
    <header class="top-nav">
      <div class="brand">
        <div class="brand-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m12 12 4 4"/><path d="m16 12-4 4"/></svg>
        </div>
        <div class="brand-text">
          <h1>AirShare Pro Admin</h1>
          <p>Sistem Analitik &amp; Monitoring Pemilik Proyek</p>
        </div>
      </div>
      <div class="nav-actions">
        <div class="live-badge" id="live-sync-badge">
          <span class="live-dot" id="live-sync-dot"></span>
          <div class="live-sync-texts">
            <span class="live-sync-title" id="live-sync-title">Diperbarui otomatis setiap 20 detik</span>
            <span class="live-sync-time" id="live-sync-time">Terakhir sinkron: ${escapeHtml(initialTimeFormatted)}</span>
          </div>
        </div>
        <form id="form-logout" method="POST" action="/${escapeHtml(fullAdminPath)}/logout" style="margin:0;">
          <button type="submit" class="btn-logout">Keluar (Logout)</button>
        </form>
      </div>
    </header>

    <!-- Admin Notification Toast / Banner -->
    <div id="admin-toast-banner" style="display:none; margin-bottom: 1.5rem; padding: 0.85rem 1.25rem; border-radius: 0.75rem; font-size: 0.85rem; font-weight: 600; align-items: center; justify-content: space-between;"></div>

    <!-- Mobile Category Tabs -->
    <nav class="admin-mobile-tabs" aria-label="Kategori Panel Mobile" role="tablist">
      <button type="button" class="admin-tab-btn active" data-category="ringkasan" id="mobile-tab-ringkasan" aria-controls="panel-ringkasan" onclick="switchCategory('ringkasan')" role="tab" aria-selected="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
        <span>Ringkasan</span>
      </button>
      <button type="button" class="admin-tab-btn" data-category="analitik" id="mobile-tab-analitik" aria-controls="panel-analitik" onclick="switchCategory('analitik')" role="tab" aria-selected="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        <span>Analitik</span>
      </button>
      <button type="button" class="admin-tab-btn" data-category="kontrol" id="mobile-tab-kontrol" aria-controls="panel-kontrol" onclick="switchCategory('kontrol')" role="tab" aria-selected="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span>Kontrol Sistem</span>
      </button>
      <button type="button" class="admin-tab-btn" data-category="keamanan" id="mobile-tab-keamanan" aria-controls="panel-keamanan" onclick="switchCategory('keamanan')" role="tab" aria-selected="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span>Keamanan &amp; Sesi</span>
      </button>
      <button type="button" class="admin-tab-btn" data-category="data" id="mobile-tab-data" aria-controls="panel-data" onclick="switchCategory('data')" role="tab" aria-selected="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>Pengelolaan Data</span>
      </button>
      <button type="button" class="admin-tab-btn" data-category="terhapus" id="tab-btn-terhapus" aria-controls="panel-terhapus" onclick="switchCategory('terhapus')" role="tab" aria-selected="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        <span>Berkas Terhapus (${deletedFiles.length})</span>
      </button>
    </nav>

    <!-- Main Layout with Desktop Sidebar -->
    <div class="admin-layout">
      <!-- Desktop Sidebar Sticky Nav -->
      <aside class="admin-sidebar" aria-label="Navigasi Kategori Admin">
        <div class="sidebar-title">Menu Utama</div>
        <nav class="sidebar-nav" role="tablist">
          <button type="button" class="admin-sidebar-btn active" data-category="ringkasan" id="sidebar-btn-ringkasan" aria-controls="panel-ringkasan" onclick="switchCategory('ringkasan')" role="tab" aria-selected="true">
            <div class="sidebar-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
            </div>
            <div class="sidebar-btn-content">
              <span class="sidebar-btn-title">Ringkasan</span>
              <span class="sidebar-btn-desc">Metrik &amp; Rekomendasi</span>
            </div>
          </button>
          <button type="button" class="admin-sidebar-btn" data-category="analitik" id="sidebar-btn-analitik" aria-controls="panel-analitik" onclick="switchCategory('analitik')" role="tab" aria-selected="false">
            <div class="sidebar-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </div>
            <div class="sidebar-btn-content">
              <span class="sidebar-btn-title">Analitik</span>
              <span class="sidebar-btn-desc">Tren, Media &amp; Geolokasi</span>
            </div>
          </button>
          <button type="button" class="admin-sidebar-btn" data-category="kontrol" id="sidebar-btn-kontrol" aria-controls="panel-kontrol" onclick="switchCategory('kontrol')" role="tab" aria-selected="false">
            <div class="sidebar-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </div>
            <div class="sidebar-btn-content">
              <span class="sidebar-btn-title">Kontrol Sistem</span>
              <span class="sidebar-btn-desc">Kill Switch &amp; Sinkronisasi</span>
            </div>
          </button>
          <button type="button" class="admin-sidebar-btn" data-category="keamanan" id="sidebar-btn-keamanan" aria-controls="panel-keamanan" onclick="switchCategory('keamanan')" role="tab" aria-selected="false">
            <div class="sidebar-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div class="sidebar-btn-content">
              <span class="sidebar-btn-title">Keamanan &amp; Sesi</span>
              <span class="sidebar-btn-desc">Sesi Aktif &amp; Log Audit</span>
            </div>
          </button>
          <button type="button" class="admin-sidebar-btn" data-category="data" id="sidebar-btn-data" aria-controls="panel-data" onclick="switchCategory('data')" role="tab" aria-selected="false">
            <div class="sidebar-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </div>
            <div class="sidebar-btn-content">
              <span class="sidebar-btn-title">Pengelolaan Data</span>
              <span class="sidebar-btn-desc">Riwayat Unggahan &amp; Cleanup</span>
            </div>
          </button>
          <button type="button" class="admin-sidebar-btn" data-category="terhapus" id="sidebar-btn-terhapus" aria-controls="panel-terhapus" onclick="switchCategory('terhapus')" role="tab" aria-selected="false">
            <div class="sidebar-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </div>
            <div class="sidebar-btn-content">
              <span class="sidebar-btn-title">Berkas Terhapus</span>
              <span class="sidebar-btn-desc">Arsip Terhapus (${deletedFiles.length})</span>
            </div>
          </button>
        </nav>
      </aside>

      <!-- Main Categorized Content Panels -->
      <main class="admin-main">
        <!-- 1. Kategori: Ringkasan -->
        <div class="category-panel active" id="panel-ringkasan" data-category-panel="ringkasan" role="tabpanel" aria-labelledby="sidebar-btn-ringkasan">
          <!-- 4 Big Number Summaries for Today -->
          <section class="metrics-grid">
            <div class="metric-card">
              <div class="metric-header">
                <span class="metric-label">Unggahan Hari Ini</span>
                <div class="metric-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
              </div>
              <div class="metric-value" id="stat-uploads">${todayStats.uploads.toLocaleString('id-ID')}</div>
              <div class="metric-sub">Total berkas baru diproses</div>
            </div>

            <div class="metric-card">
              <div class="metric-header">
                <span class="metric-label">Volume Data Hari Ini</span>
                <div class="metric-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h12"/><path d="M6 14h12"/><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/></svg>
                </div>
              </div>
              <div class="metric-value" id="stat-bytes">${escapeHtml(todayStats.formattedBytes)}</div>
              <div class="metric-sub">Total throughput data unggahan</div>
            </div>

            <div class="metric-card">
              <div class="metric-header">
                <span class="metric-label">Kunjungan Berkas Hari Ini</span>
                <div class="metric-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                </div>
              </div>
              <div class="metric-value" id="stat-views">${todayStats.totalViews.toLocaleString('id-ID')}</div>
              <div class="metric-sub">Akses laman share publik (/s/:id)</div>
            </div>

            <div class="metric-card">
              <div class="metric-header">
                <span class="metric-label">Rata-rata Ukuran Berkas</span>
                <div class="metric-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>
                </div>
              </div>
              <div class="metric-value" id="stat-avg">${escapeHtml(todayStats.formattedAverageSize)}</div>
              <div class="metric-sub">Ukuran rata-rata per berkas</div>
            </div>
          </section>

          <!-- Automated Recommendations & Gemini AI Real-Time Analysis Section -->
          <section class="ai-rec-box" id="ai-rec-section">
            <div class="ai-rec-header">
              <div class="ai-rec-title-group">
                <div class="ai-rec-sparkle-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                </div>
                <div>
                  <div class="ai-rec-title">
                    Rekomendasi Sistem Otomatis &amp; Analisis Real-Time
                  </div>
                  <div style="font-size: 0.725rem; color: var(--muted); margin-top: 0.15rem;">
                    Insight prediktif kapasitas &amp; arsitektur bertenaga Google Gemini
                  </div>
                </div>
              </div>

              <div class="ai-rec-actions">
                <span class="ai-badge-model" id="ai-rec-model-badge">
                  <span class="ai-badge-pulse"></span>
                  <span id="ai-rec-model-label">Gemini 3.8 Flash</span>
                </span>
                <button type="button" class="btn-ai-refresh" id="btn-refresh-ai-rec" title="Minta Gemini AI menganalisis data metrik sistem terkini">
                  <svg id="ai-refresh-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                  <span id="ai-refresh-text">Analisis AI</span>
                </button>
              </div>
            </div>

            <!-- Custom Loading Skeleton (Shown during Gemini AI generation) -->
            <div class="ai-skeleton-container" id="ai-rec-skeleton">
              <div class="ai-skeleton-status">
                <span class="ai-skeleton-pulse-dot"></span>
                <span>Gemini sedang memproses data metrik sistem dan tren berkas secara real-time...</span>
              </div>
              <div class="skeleton-shimmer skeleton-card"></div>
              <div class="skeleton-shimmer skeleton-row"></div>
              <div class="skeleton-shimmer skeleton-row"></div>
              <div class="skeleton-shimmer skeleton-row" style="width: 85%;"></div>
            </div>

            <!-- AI Content Container -->
            <div id="ai-rec-content">
              <!-- Executive Summary -->
              <div class="ai-summary-card" id="ai-rec-summary-card">
                <div class="ai-summary-label">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                  Ringkasan Eksekutif Real-Time
                </div>
                <div id="ai-rec-summary-text">
                  Infrastruktur AirShare Pro beroperasi pada mode ${escapeHtml(storageMode)} dengan ${todayStats.uploads} unggahan (${escapeHtml(todayStats.formattedBytes)}) dan ${todayStats.totalViews} tayangan hari ini.
                </div>
              </div>

              <!-- Recommendation List -->
              <ul class="ai-recs-list" id="ai-rec-list">
                ${recommendations
                  .map(
                    (r) =>
                      `<li class="ai-list-item"><span class="ai-bullet">✦</span><div class="ai-item-body">${escapeHtml(
                        r
                      )}</div></li>`
                  )
                  .join('')}
              </ul>

              <div class="ai-meta-footer">
                <span id="ai-rec-timestamp">Status data terkini: ${initialTimeFormatted}</span>
                <span style="color: var(--muted);">Dianalisis langsung dari metrik analitik &amp; penyimpanan hulu</span>
              </div>
            </div>

            <!-- Error Notification Container -->
            <div class="ai-error-box" id="ai-rec-error">
              <div class="ai-error-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>Gagal Memuat Analisis Gemini AI</span>
              </div>
              <div class="ai-error-desc" id="ai-rec-error-msg">
                Terjadi kendala saat menghubungi Gemini AI.
              </div>
              <div class="ai-error-actions">
                <button type="button" class="btn-ai-retry" id="btn-ai-retry">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                  Coba Lagi
                </button>
                <button type="button" class="btn-ai-fallback" id="btn-ai-use-fallback">
                  Gunakan Rekomendasi Heuristik
                </button>
              </div>
            </div>
          </section>
        </div>

        <!-- 2. Kategori: Analitik -->
        <div class="category-panel" id="panel-analitik" data-category-panel="analitik" role="tabpanel" aria-labelledby="sidebar-btn-analitik">
          <!-- 7-Day Trend & Media Type Distribution -->
          <div class="section-grid">
            <!-- 7-Day Trend Chart -->
            <section class="panel">
              <div class="panel-header">
                <h2 class="panel-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  Tren Unggahan 7 Hari Terakhir
                </h2>
                <span class="panel-badge">Aktivitas Harian</span>
              </div>
              <div class="chart-container">
                <div class="chart-bars">
                  ${weeklyTrend
                    .map((d) => {
                      const heightPercent = Math.max(8, Math.round((d.uploads / maxDailyUploads) * 100));
                      return `
                      <div class="chart-col">
                        <div class="chart-tooltip-label">${d.uploads}</div>
                        <div class="chart-bar" style="height: ${heightPercent}%;" title="${d.date}: ${d.uploads} uploads (${d.formattedBytes})"></div>
                        <div class="chart-date">${d.date.slice(5)}</div>
                      </div>`;
                    })
                    .join('')}
                </div>
              </div>
            </section>

            <!-- Distribution by Media Type -->
            <section class="panel">
              <div class="panel-header">
                <h2 class="panel-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                  Distribusi Media Hari Ini
                </h2>
                <span class="panel-badge">${totalUploadedToday} berkas</span>
              </div>

              <div class="dist-item">
                <div class="dist-header">
                  <span>Foto / Gambar</span>
                  <span>${typeCounts.image} (${totalUploadedToday > 0 ? Math.round((typeCounts.image / totalUploadedToday) * 100) : 0}%)</span>
                </div>
                <div class="dist-bar-track">
                  <div class="dist-bar-fill" style="width: ${totalUploadedToday > 0 ? (typeCounts.image / totalUploadedToday) * 100 : 0}%; background: #10b981;"></div>
                </div>
              </div>

              <div class="dist-item">
                <div class="dist-header">
                  <span>Video</span>
                  <span>${typeCounts.video} (${totalUploadedToday > 0 ? Math.round((typeCounts.video / totalUploadedToday) * 100) : 0}%)</span>
                </div>
                <div class="dist-bar-track">
                  <div class="dist-bar-fill" style="width: ${totalUploadedToday > 0 ? (typeCounts.video / totalUploadedToday) * 100 : 0}%; background: #8b5cf6;"></div>
                </div>
              </div>

              <div class="dist-item">
                <div class="dist-header">
                  <span>Audio / Musik</span>
                  <span>${typeCounts.audio} (${totalUploadedToday > 0 ? Math.round((typeCounts.audio / totalUploadedToday) * 100) : 0}%)</span>
                </div>
                <div class="dist-bar-track">
                  <div class="dist-bar-fill" style="width: ${totalUploadedToday > 0 ? (typeCounts.audio / totalUploadedToday) * 100 : 0}%; background: #ec4899;"></div>
                </div>
              </div>

              <div class="dist-item">
                <div class="dist-header">
                  <span>Dokumen &amp; Arsip</span>
                  <span>${typeCounts.file} (${totalUploadedToday > 0 ? Math.round((typeCounts.file / totalUploadedToday) * 100) : 0}%)</span>
                </div>
                <div class="dist-bar-track">
                  <div class="dist-bar-fill" style="width: ${totalUploadedToday > 0 ? (typeCounts.file / totalUploadedToday) * 100 : 0}%; background: #f59e0b;"></div>
                </div>
              </div>
            </section>
          </div>

          <!-- Country Geolocation & Top Files Grid -->
          <div class="section-grid">
            <!-- Country Distribution -->
            <section class="panel">
              <div class="panel-header">
                <h2 class="panel-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                  Asal Negara Pengunggah Hari Ini
                </h2>
                <span class="panel-badge">IP Geolocation</span>
              </div>

              ${
                sortedCountries.length === 0
                  ? `<p style="color: var(--muted); font-size: 0.85rem; padding: 1rem 0;">Belum ada data geolokasi hari ini.</p>`
                  : sortedCountries
                      .slice(0, 8)
                      .map(([code, count]) => {
                        const flagPath = getFlagAssetPath(code);
                        return `
                  <div class="country-row">
                    <div class="country-info">
                      <img src="${escapeHtml(flagPath)}" alt="${escapeHtml(code)}" class="country-flag" onerror="this.src='/flags/globe.svg';" />
                      <span style="font-weight: 600;">${escapeHtml(code)}</span>
                    </div>
                    <span style="font-weight: 700; color: var(--accent);">${count} unggahan</span>
                  </div>`;
                      })
                      .join('')
              }
            </section>

            <!-- Top 10 Popular Files -->
            <section class="panel">
              <div class="panel-header">
                <h2 class="panel-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  Berkas Terpopuler
                </h2>
                <span class="panel-badge">Total Views</span>
              </div>

              ${
                topFiles.length === 0
                  ? `<p style="color: var(--muted); font-size: 0.85rem; padding: 1rem 0;">Belum ada riwayat tayangan berkas.</p>`
                  : topFiles
                      .map(
                        (f, idx) => `
                  <div class="country-row">
                    <div class="country-info" style="min-width: 0; flex: 1;">
                      <span style="font-size: 0.75rem; font-weight: 800; color: var(--muted); width: 18px;">#${
                        idx + 1
                      }</span>
                      <a href="/s/${encodeURIComponent(
                        f.id
                      )}" target="_blank" class="link-view" style="max-width: clamp(120px, 40vw, 220px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.825rem;" title="${escapeHtml(
                          f.name
                        )}">
                        ${escapeHtml(f.name)}
                      </a>
                    </div>
                    <span style="font-weight: 700; color: #60a5fa; font-size: 0.85rem;">${
                      f.views
                    } tayangan</span>
                  </div>`
                      )
                      .join('')
              }
            </section>
          </div>
        </div>

        <!-- 3. Kategori: Kontrol Sistem -->
        <div class="category-panel" id="panel-kontrol" data-category-panel="kontrol" role="tabpanel" aria-labelledby="sidebar-btn-kontrol">
          <!-- Kontrol Operasional & Konfigurasi Dinamis (Kill Switch & Dynamic Config) -->
          ${renderOperationalControlsHtml(systemConfig)}

          <!-- Sinkronisasi Data Catbox & Redis Panel -->
          <section class="panel" style="margin-bottom: 1.5rem;" id="sync-panel">
            <div class="panel-header">
              <h2 class="panel-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                Sinkronisasi Data (Redis &harr; Catbox)
              </h2>
              <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                <span class="panel-badge" id="sync-last-checked-label">
                  ${
                    lastSyncCheck
                      ? `Terakhir diperiksa: ${formatRelativeTime(lastSyncCheck.timestamp)} (${formatAbsoluteTime(lastSyncCheck.timestamp)})`
                      : 'Belum pernah diperiksa'
                  }
                </span>
                <button type="button" id="btn-run-sync" class="btn-sync-action">
                  <svg id="sync-spinner-icon" style="display:none; width: 14px; height: 14px; animation: spin 1s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                  <span id="sync-btn-text">Jalankan Pemeriksaan Sinkronisasi</span>
                </button>
              </div>
            </div>

            <div id="sync-summary-container">
              ${renderSyncSummaryHtml(lastSyncCheck)}
            </div>
          </section>
        </div>

        <!-- 4. Kategori: Keamanan & Sesi -->
        <div class="category-panel" id="panel-keamanan" data-category-panel="keamanan" role="tabpanel" aria-labelledby="sidebar-btn-keamanan">
          <!-- Manajemen Sesi Admin Aktif -->
          ${renderActiveSessionsHtml(activeSessions)}

          <!-- Log Aktivitas Keamanan & Audit Admin -->
          ${renderAuditLogsHtml(auditLogs)}
        </div>

        <!-- 5. Kategori: Pengelolaan Data -->
        <div class="category-panel" id="panel-data" data-category-panel="data" role="tabpanel" aria-labelledby="sidebar-btn-data">
          <!-- 50 Most Recent Uploads Across All Sessions -->
          <section class="panel" style="margin-bottom: 1.5rem;">
            <div class="panel-header">
              <h2 class="panel-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                50 Unggahan Terakhir (Lintas Semua Sesi)
              </h2>
              <span class="panel-badge" id="stat-total-stored">Total Tersimpan: ${totalItemsInRepo.toLocaleString('id-ID')} item (${enhancedRecentUploads.length} termonitor)</span>
            </div>

            <!-- Search & Quick Filter Bar -->
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; padding: 0.25rem 0;">
              <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1; min-width: 260px;">
                <input type="text" id="search-files-input" placeholder="Filter nama berkas atau ID di bawah..." style="flex: 1; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.45rem 0.75rem; font-size: 0.825rem;" />
                <button type="button" id="btn-search-db" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: var(--fg); padding: 0.45rem 0.85rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; white-space: nowrap;">Cari di Seluruh DB</button>
                <button type="button" id="btn-reset-search" style="background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 0.45rem 0.65rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer;">Reset</button>
              </div>
              <span id="search-count-label" style="font-size: 0.75rem; color: #60a5fa; font-weight: 600;"></span>
            </div>

            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Berkas</th>
                    <th>Tipe</th>
                    <th>Ukuran</th>
                    <th>Negara</th>
                    <th>Waktu Unggah</th>
                    <th>Tayangan</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    enhancedRecentUploads.length === 0
                      ? `<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 2rem;">Belum ada unggahan yang tercatat di repositori.</td></tr>`
                      : enhancedRecentUploads
                          .map((item) => {
                            const flagPath = getFlagAssetPath(item.uploaderCountryCode);
                            return `
                    <tr id="upload-row-${escapeHtml(item.id)}">
                      <td>
                        <div style="font-weight: 700; max-width: clamp(120px, 40vw, 220px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(
                          item.name
                        )}">
                          ${escapeHtml(item.name)}
                        </div>
                        <div style="font-size: 0.7rem; color: var(--muted);">${escapeHtml(
                          item.id
                        )}</div>
                      </td>
                      <td>
                        <span class="badge-type badge-${escapeHtml(item.type)}">${escapeHtml(
                              item.type
                            )}</span>
                      </td>
                      <td style="font-weight: 600;">${escapeHtml(item.formattedSize)}</td>
                      <td>
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                          <img src="${escapeHtml(
                            flagPath
                          )}" alt="${escapeHtml(item.uploaderCountryCode || 'Globe')}" class="country-flag" onerror="this.src='/flags/globe.svg';" />
                          <span style="font-size: 0.8rem;">${escapeHtml(
                            item.uploaderCountryCode || '-'
                          )}</span>
                        </div>
                      </td>
                      <td>
                        <div style="font-weight: 600;">${formatRelativeTime(item.createdAt)}</div>
                        <div style="font-size: 0.7rem; color: var(--muted);">${formatAbsoluteTime(
                          item.createdAt
                        )}</div>
                      </td>
                      <td style="font-weight: 700; color: #60a5fa;">${item.views}</td>
                      <td>
                        <div style="display: inline-flex; align-items: center; gap: 0.6rem;">
                          <a href="/s/${encodeURIComponent(
                            item.id
                          )}" target="_blank" class="link-view">Buka</a>
                          <button type="button" class="btn-delete-perm" data-id="${escapeHtml(
                            item.id
                          )}" data-name="${escapeHtml(item.name)}">Hapus Permanen</button>
                        </div>
                      </td>
                    </tr>`;
                          })
                          .join('')
                  }
                </tbody>
              </table>
            </div>
          </section>

          <!-- Pembersihan Massal (Bulk Cleanup Berdasarkan Kriteria) -->
          ${renderBulkCleanupHtml()}
        </div>

        <!-- 6. Kategori: Berkas Terhapus -->
        <div class="category-panel" id="panel-terhapus" data-category-panel="terhapus" role="tabpanel" aria-labelledby="sidebar-btn-terhapus">
          <section class="panel" style="margin-bottom: 1.5rem;">
            <div class="panel-header">
              <h2 class="panel-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                Arsip &amp; Riwayat Berkas Terhapus
              </h2>
              <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                <span class="panel-badge" id="deleted-count-badge">${deletedFiles.length} Berkas Tercatat</span>
                ${
                  deletedFiles.length > 0
                    ? `<button type="button" id="btn-clear-deleted-history" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; padding: 0.4rem 0.85rem; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">Bersihkan Seluruh Riwayat Terhapus</button>`
                    : ''
                }
              </div>
            </div>

            <!-- Search Deleted Files Filter -->
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; padding: 0.25rem 0;">
              <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1; min-width: 260px;">
                <input type="text" id="search-deleted-input" placeholder="Filter berkas terhapus berdasarkan nama, ID, atau alasan..." style="flex: 1; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); padding: 0.45rem 0.75rem; font-size: 0.825rem;" />
                <button type="button" id="btn-reset-deleted-search" style="background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 0.45rem 0.65rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer;">Reset</button>
              </div>
              <span id="deleted-search-count-label" style="font-size: 0.75rem; color: #f87171; font-weight: 600;"></span>
            </div>

            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Berkas Terhapus</th>
                    <th>Tipe &amp; Ukuran</th>
                    <th>Tautan Catbox Asal</th>
                    <th>Waktu Dihapus</th>
                    <th>Dihapus Oleh</th>
                    <th>Alasan / Keterangan</th>
                  </tr>
                </thead>
                <tbody id="deleted-files-tbody">
                  ${
                    deletedFiles.length === 0
                      ? `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 2.5rem 1rem;">
                          <div style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.35rem; color: var(--text);">Tidak ada riwayat berkas terhapus</div>
                          <div style="font-size: 0.8rem;">Ketika berkas dihapus oleh pengguna atau admin, riwayat auditnya akan dipisahkan secara aman ke dalam tab ini.</div>
                        </td></tr>`
                      : deletedFiles
                          .map((df) => {
                            let byBadge = '';
                            if (df.deletedBy === 'admin') {
                              byBadge = '<span style="display: inline-block; padding: 0.2rem 0.5rem; font-size: 0.7rem; font-weight: 700; border-radius: 4px; background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);">Admin</span>';
                            } else if (df.deletedBy === 'user') {
                              byBadge = '<span style="display: inline-block; padding: 0.2rem 0.5rem; font-size: 0.7rem; font-weight: 700; border-radius: 4px; background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3);">Pengguna</span>';
                            } else if (df.deletedBy === 'sync_purge') {
                              byBadge = '<span style="display: inline-block; padding: 0.2rem 0.5rem; font-size: 0.7rem; font-weight: 700; border-radius: 4px; background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3);">Sync Purge (404)</span>';
                            } else if (df.deletedBy === 'bulk_cleanup') {
                              byBadge = '<span style="display: inline-block; padding: 0.2rem 0.5rem; font-size: 0.7rem; font-weight: 700; border-radius: 4px; background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3);">Bulk Cleanup</span>';
                            } else {
                              byBadge = '<span style="display: inline-block; padding: 0.2rem 0.5rem; font-size: 0.7rem; font-weight: 700; border-radius: 4px; background: rgba(255, 255, 255, 0.1); color: var(--muted);">' + escapeHtml(df.deletedBy || 'System') + '</span>';
                            }

                            return `
                    <tr id="deleted-row-${escapeHtml(df.id)}">
                      <td>
                        <div style="font-weight: 700; color: #f87171; max-width: clamp(140px, 20vw, 240px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(
                          df.name
                        )}">
                          ${escapeHtml(df.name)}
                        </div>
                        <div style="font-size: 0.7rem; color: var(--muted);">${escapeHtml(df.id)}</div>
                      </td>
                      <td>
                        <div style="font-size: 0.8rem; font-weight: 600;">${escapeHtml(df.formattedSize || '-')}</div>
                        <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase;">${escapeHtml(df.type || 'file')}</div>
                      </td>
                      <td>
                        <a href="${escapeHtml(
                          df.shareUrl
                        )}" target="_blank" class="link-view" style="font-size: 0.75rem; color: var(--muted); max-width: clamp(120px, 20vw, 200px); display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                          ${escapeHtml(df.shareUrl)}
                        </a>
                      </td>
                      <td>
                        <div style="font-size: 0.8rem; font-weight: 600;">${formatRelativeTime(
                          df.deletedAt
                        )}</div>
                        <div style="font-size: 0.7rem; color: var(--muted);">${formatAbsoluteTime(
                          df.deletedAt
                        )}</div>
                      </td>
                      <td>${byBadge}</td>
                      <td>
                        <div style="font-size: 0.775rem; color: var(--muted); max-width: 240px; line-height: 1.3;">
                          ${escapeHtml(df.reason || 'Dihapus dari penyimpanan')}
                        </div>
                      </td>
                    </tr>`;
                          })
                          .join('')
                  }
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>

    <!-- System Health Status Bar -->
    <footer class="health-bar">
      <div class="health-item" id="health-storage">
        <span class="status-indicator ${redisConnected || !isUpstashConfigured() ? 'status-ok' : 'status-warn'}"></span>
        <span>Storage Backend: <strong>${escapeHtml(storageMode)}</strong></span>
      </div>
      <div class="health-item" id="health-catbox">
        <span class="status-indicator ${catboxHealth.available ? 'status-ok' : 'status-warn'}"></span>
        <span>Catbox Upstream: <strong>${
          catboxHealth.available
            ? `Tersedia (${catboxHealth.latencyMs}ms)`
            : 'Tidak Tersedia — Periksa Status Catbox'
        }</strong></span>
      </div>
      <div class="health-item">
        <span>Server Uptime: <strong>${escapeHtml(uptimeFormatted)}</strong></span>
      </div>
      <div class="health-item">
        <span>Kerahasiaan: <strong>No-Index / No-Follow Active</strong></span>
      </div>
    </footer>
  </div>

  <!-- Global iOS-Style Alert/Confirm Modal Dialog -->
  <div id="ios-modal-container" class="ios-modal-overlay" role="dialog" aria-modal="true" aria-hidden="true">
    <div class="ios-modal-box">
      <div class="ios-modal-body-content">
        <div id="ios-modal-icon" class="ios-modal-icon-badge" style="display:none;"></div>
        <div id="ios-modal-title" class="ios-modal-title"></div>
        <div id="ios-modal-message" class="ios-modal-desc"></div>
      </div>
      <div id="ios-modal-actions" class="ios-modal-actions-row"></div>
    </div>
  </div>

  <script>
    // Global iOS-style confirmation modal handler
    window.showIosConfirm = function(options) {
      return new Promise(function(resolve) {
        options = options || {};
        const container = document.getElementById('ios-modal-container');
        const iconEl = document.getElementById('ios-modal-icon');
        const titleEl = document.getElementById('ios-modal-title');
        const msgEl = document.getElementById('ios-modal-message');
        const actionsEl = document.getElementById('ios-modal-actions');

        if (!container || !titleEl || !msgEl || !actionsEl) {
          resolve(confirm((options.title ? options.title + '\\n\\n' : '') + (options.message || '')));
          return;
        }

        titleEl.textContent = options.title || 'Konfirmasi Tindakan';
        msgEl.textContent = options.message || '';

        const isDestructive = options.isDestructive !== false;
        const iconType = options.icon || (isDestructive ? 'danger' : 'warning');
        
        let iconSvg = '';
        if (iconType === 'danger') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        } else if (iconType === 'warning') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
        } else if (iconType === 'success') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
        } else {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        }

        if (iconEl) {
          iconEl.className = 'ios-modal-icon-badge ios-modal-icon-' + iconType;
          iconEl.innerHTML = iconSvg;
          iconEl.style.display = 'flex';
        }

        actionsEl.innerHTML = '<button type="button" class="ios-modal-btn ios-modal-btn-cancel" id="ios-btn-cancel">' + (options.cancelText || 'Batal') + '</button>' +
          '<button type="button" class="ios-modal-btn ' + (isDestructive ? 'ios-modal-btn-danger' : 'ios-modal-btn-primary') + '" id="ios-btn-confirm">' + (options.confirmText || (isDestructive ? 'Ya, Lanjutkan' : 'Konfirmasi')) + '</button>';

        function cleanup(result) {
          container.classList.remove('active');
          container.setAttribute('aria-hidden', 'true');
          document.removeEventListener('keydown', handleKey);
          resolve(result);
        }

        function handleKey(e) {
          if (e.key === 'Escape') cleanup(false);
        }

        const btnCancel = document.getElementById('ios-btn-cancel');
        const btnConfirm = document.getElementById('ios-btn-confirm');
        if (btnCancel) btnCancel.onclick = function() { cleanup(false); };
        if (btnConfirm) btnConfirm.onclick = function() { cleanup(true); };
        document.addEventListener('keydown', handleKey);

        container.classList.add('active');
        container.setAttribute('aria-hidden', 'false');
      });
    };

    // Global iOS-style statement/alert modal handler
    window.showIosAlert = function(options) {
      return new Promise(function(resolve) {
        options = options || {};
        const container = document.getElementById('ios-modal-container');
        const iconEl = document.getElementById('ios-modal-icon');
        const titleEl = document.getElementById('ios-modal-title');
        const msgEl = document.getElementById('ios-modal-message');
        const actionsEl = document.getElementById('ios-modal-actions');

        if (!container || !titleEl || !msgEl || !actionsEl) {
          alert((options.title ? options.title + '\\n\\n' : '') + (options.message || ''));
          resolve();
          return;
        }

        titleEl.textContent = options.title || 'Pemberitahuan';
        msgEl.textContent = options.message || '';

        const iconType = options.icon || 'info';
        let iconSvg = '';
        if (iconType === 'danger') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        } else if (iconType === 'success') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
        } else if (iconType === 'warning') {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
        } else {
          iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        }

        if (iconEl) {
          iconEl.className = 'ios-modal-icon-badge ios-modal-icon-' + iconType;
          iconEl.innerHTML = iconSvg;
          iconEl.style.display = 'flex';
        }

        actionsEl.innerHTML = '<button type="button" class="ios-modal-btn ios-modal-btn-primary" id="ios-btn-ok">' + (options.buttonText || 'Mengerti') + '</button>';

        function cleanup() {
          container.classList.remove('active');
          container.setAttribute('aria-hidden', 'true');
          document.removeEventListener('keydown', handleKey);
          resolve();
        }

        function handleKey(e) {
          if (e.key === 'Escape' || e.key === 'Enter') cleanup();
        }

        const btnOk = document.getElementById('ios-btn-ok');
        if (btnOk) btnOk.onclick = function() { cleanup(); };
        document.addEventListener('keydown', handleKey);

        container.classList.add('active');
        container.setAttribute('aria-hidden', 'false');
      });
    };

    (function() {
      const panelPath = ${JSON.stringify(fullAdminPath)};
      const badgeDot = document.getElementById('live-sync-dot');
      const badgeTitle = document.getElementById('live-sync-title');
      const badgeTime = document.getElementById('live-sync-time');

      // Intercept Logout Form with iOS Modal Confirmation
      const formLogout = document.getElementById('form-logout');
      if (formLogout) {
        formLogout.addEventListener('submit', async function(e) {
          e.preventDefault();
          const confirmed = await window.showIosConfirm({
            title: 'Keluar dari Panel Admin?',
            message: 'Sesi administrasi Anda akan diakhiri dan Anda harus memasukkan PIN kembali untuk masuk.',
            confirmText: 'Keluar',
            cancelText: 'Batal',
            isDestructive: true,
            icon: 'warning'
          });
          if (confirmed) {
            formLogout.submit();
          }
        });
      }

      function showToast(msg, isError, isWarn) {
        const toast = document.getElementById('admin-toast-banner');
        if (!toast) return;
        toast.style.display = 'flex';
        if (isError) {
          toast.style.background = 'rgba(239, 68, 68, 0.15)';
          toast.style.border = '1px solid rgba(239, 68, 68, 0.3)';
          toast.style.color = '#f87171';
        } else if (isWarn) {
          toast.style.background = 'rgba(245, 158, 11, 0.15)';
          toast.style.border = '1px solid rgba(245, 158, 11, 0.3)';
          toast.style.color = '#fbbf24';
        } else {
          toast.style.background = 'rgba(16, 185, 129, 0.15)';
          toast.style.border = '1px solid rgba(16, 185, 129, 0.3)';
          toast.style.color = '#34d399';
        }

        toast.innerHTML = '';
        const msgSpan = document.createElement('span');
        msgSpan.textContent = msg;
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = 'background:none; border:none; color:inherit; font-size:1.1rem; cursor:pointer; padding:0 0.5rem;';
        closeBtn.addEventListener('click', function() {
          toast.style.display = 'none';
        });
        toast.appendChild(msgSpan);
        toast.appendChild(closeBtn);

        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      // 0. Category Switching & High-Performance Touch Navigation Handler
      const VALID_CATEGORIES = ['ringkasan', 'analitik', 'kontrol', 'keamanan', 'data', 'terhapus'];

      function switchCategory(catName, shouldUpdateHash) {
        if (!catName) return;
        const normalized = String(catName).toLowerCase().trim().replace(/^#/, '');
        const targetCat = VALID_CATEGORIES.includes(normalized) ? normalized : 'ringkasan';

        // Update active panels
        const panels = document.querySelectorAll('.category-panel');
        panels.forEach(function(panel) {
          if (panel.getAttribute('data-category-panel') === targetCat) {
            panel.classList.add('active');
            panel.setAttribute('aria-hidden', 'false');
          } else {
            panel.classList.remove('active');
            panel.setAttribute('aria-hidden', 'true');
          }
        });

        // Update sidebar nav buttons
        const sBtns = document.querySelectorAll('.admin-sidebar-btn');
        sBtns.forEach(function(btn) {
          const isActive = btn.getAttribute('data-category') === targetCat;
          if (isActive) {
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
          } else {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
          }
        });

        // Update mobile horizontal tabs
        const tBtns = document.querySelectorAll('.admin-tab-btn');
        tBtns.forEach(function(btn) {
          const isActive = btn.getAttribute('data-category') === targetCat;
          if (isActive) {
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            try {
              btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            } catch (e) {}
          } else {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
          }
        });

        // Save preference in localStorage
        try {
          localStorage.setItem('airshare_admin_active_cat', targetCat);
        } catch (e) {}

        // Sync URL hash without jumping
        if (shouldUpdateHash !== false) {
          try {
            if (window.location.hash !== '#' + targetCat) {
              history.replaceState(null, '', '#' + targetCat);
            }
          } catch (e) {}
        }
      }

      // Expose globally for inline onclick or console/external triggers
      window.switchCategory = switchCategory;
      window.switchAdminCategory = switchCategory;

      // Event delegation on document to guarantee clicks on buttons, SVGs, or spans are ALWAYS caught
      document.addEventListener('click', function(e) {
        const trigger = e.target.closest('.admin-sidebar-btn, .admin-tab-btn, [data-category]');
        if (trigger) {
          const cat = trigger.getAttribute('data-category');
          if (cat) {
            e.preventDefault();
            switchCategory(cat, true);
          }
        }
      });

      // Handle browser back/forward navigation or direct hash links
      window.addEventListener('hashchange', function() {
        try {
          const hashCat = (window.location.hash || '').replace(/^#/, '').trim();
          if (hashCat) {
            switchCategory(hashCat, false);
          }
        } catch (e) {}
      });

      // Resolve initial category on page load:
      // 1. URL hash (#analitik)
      // 2. URL search param (?tab=analitik or ?category=analitik)
      // 3. Saved localStorage
      // 4. Default: 'ringkasan'
      (function resolveInitialCategory() {
        let initialCat = '';
        try {
          const hashVal = (window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
          if (hashVal && VALID_CATEGORIES.includes(hashVal)) {
            initialCat = hashVal;
          }
        } catch (e) {}

        if (!initialCat) {
          try {
            const params = new URLSearchParams(window.location.search);
            const queryVal = (params.get('tab') || params.get('category') || params.get('cat') || '').trim().toLowerCase();
            if (queryVal && VALID_CATEGORIES.includes(queryVal)) {
              initialCat = queryVal;
            }
          } catch (e) {}
        }

        if (!initialCat) {
          try {
            const savedCat = (localStorage.getItem('airshare_admin_active_cat') || '').trim().toLowerCase();
            if (savedCat && VALID_CATEGORIES.includes(savedCat)) {
              initialCat = savedCat;
            }
          } catch (e) {}
        }

        if (!initialCat) {
          initialCat = 'ringkasan';
        }

        switchCategory(initialCat, false);
      })();

      // 0.0 Gemini AI Real-Time System Recommendations Engine
      function renderGeminiMarkup(raw) {
        if (!raw) return '';
        // 1. Escape HTML special characters for strict XSS prevention
        let str = String(raw)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');

        // 2. Headings
        str = str.replace(/^### (.*?)$/gm, '<h4 class="ai-heading-3">$1</h4>');
        str = str.replace(/^## (.*?)$/gm, '<h3 class="ai-heading-3">$1</h3>');

        // 3. Bold text
        str = str.replace(/\*\*(.*?)\*\*/g, '<strong class="ai-bold">$1</strong>');
        str = str.replace(/__(.*?)__/g, '<strong class="ai-bold">$1</strong>');

        // 4. Italic text
        str = str.replace(/(^|[^*])\*([^*]+)\*([^*]|$)/g, '$1<em class="ai-italic">$2</em>$3');

        // 5. Code blocks / inline code (using safe char code to prevent template backtick clash)
        const tick = String.fromCharCode(96);
        str = str.split(tick).map(function(part, idx) {
          return idx % 2 === 1 ? '<code class="ai-code">' + part + '</code>' : part;
        }).join('');

        return str;
      }

      const recSkeleton = document.getElementById('ai-rec-skeleton');
      const recContent = document.getElementById('ai-rec-content');
      const recError = document.getElementById('ai-rec-error');
      const recErrorMsg = document.getElementById('ai-rec-error-msg');
      const recSummaryText = document.getElementById('ai-rec-summary-text');
      const recList = document.getElementById('ai-rec-list');
      const recModelLabel = document.getElementById('ai-rec-model-label');
      const recTimestamp = document.getElementById('ai-rec-timestamp');
      const btnRefreshAi = document.getElementById('btn-refresh-ai-rec');
      const aiRefreshIcon = document.getElementById('ai-refresh-icon');
      const aiRefreshText = document.getElementById('ai-refresh-text');
      const btnAiRetry = document.getElementById('btn-ai-retry');
      const btnAiFallback = document.getElementById('btn-ai-use-fallback');

      function setAiLoading(isLoading) {
        if (isLoading) {
          if (recSkeleton) recSkeleton.style.display = 'flex';
          if (recContent) recContent.style.display = 'none';
          if (recError) recError.style.display = 'none';
          if (btnRefreshAi) btnRefreshAi.disabled = true;
          if (aiRefreshIcon) aiRefreshIcon.style.animation = 'spin 1s infinite linear';
          if (aiRefreshText) aiRefreshText.textContent = 'Menganalisis...';
        } else {
          if (recSkeleton) recSkeleton.style.display = 'none';
          if (btnRefreshAi) btnRefreshAi.disabled = false;
          if (aiRefreshIcon) aiRefreshIcon.style.animation = '';
          if (aiRefreshText) aiRefreshText.textContent = 'Analisis AI';
        }
      }

      async function fetchAiRecommendations() {
        setAiLoading(true);
        try {
          const res = await fetch('/${fullAdminPath}/api/ai-recommendations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });

          if (!res.ok) {
            throw new Error('Server mengembalikan HTTP ' + res.status);
          }

          const data = await res.json();

          if (!data || (!data.summary && (!data.recommendations || data.recommendations.length === 0))) {
            throw new Error(data && data.error ? data.error : 'Respon rekomendasi kosong.');
          }

          // Render Executive Summary
          if (recSummaryText && data.summary) {
            recSummaryText.innerHTML = renderGeminiMarkup(data.summary);
          }

          // Render Recommendations List
          if (recList && Array.isArray(data.recommendations)) {
            recList.innerHTML = data.recommendations
              .map(function(item) {
                const formatted = renderGeminiMarkup(item);
                return '<li class="ai-list-item"><span class="ai-bullet">✦</span><div class="ai-item-body">' + formatted + '</div></li>';
              })
              .join('');
          }

          // Update Model Badge
          if (recModelLabel) {
            recModelLabel.textContent = data.isAi ? 'Gemini 3.8 Flash • Real-Time AI' : 'Mesin Heuristik Sistem';
          }

          // Update Timestamp
          if (recTimestamp) {
            const now = new Date();
            const timeFormatted = String(now.getHours()).padStart(2, '0') + ':' +
                                  String(now.getMinutes()).padStart(2, '0') + ':' +
                                  String(now.getSeconds()).padStart(2, '0');
            recTimestamp.textContent = (data.isAi ? 'Dianalisis secara real-time oleh Gemini: ' : 'Status heuristik lokal: ') + timeFormatted;
          }

          if (recContent) recContent.style.display = 'block';
          if (recError) recError.style.display = 'none';

          if (data.error && !data.isAi) {
            showToast(data.error, false, true);
          }
        } catch (err) {
          console.error('[AI_RECOMMENDATION_ERROR]', err);
          if (recContent) recContent.style.display = 'none';
          if (recError) {
            recError.style.display = 'block';
            if (recErrorMsg) {
              recErrorMsg.textContent = 'Kendala: ' + (err.message || 'Gagal terhubung ke layanan AI Gemini.');
            }
          }
        } finally {
          setAiLoading(false);
        }
      }

      if (btnRefreshAi) {
        btnRefreshAi.addEventListener('click', function() {
          fetchAiRecommendations();
        });
      }

      if (btnAiRetry) {
        btnAiRetry.addEventListener('click', function() {
          fetchAiRecommendations();
        });
      }

      if (btnAiFallback) {
        btnAiFallback.addEventListener('click', function() {
          if (recError) recError.style.display = 'none';
          if (recContent) recContent.style.display = 'block';
          if (recModelLabel) recModelLabel.textContent = 'Mesin Heuristik Bawaan';
        });
      }

      // Automatically trigger initial AI analysis in background on page load
      setTimeout(function() {
        fetchAiRecommendations();
      }, 400);

      // 0.1 Quick Table Search & Filter for Uploads
      const searchInput = document.getElementById('search-files-input');
      const btnResetSearch = document.getElementById('btn-reset-search');
      const searchCountLabel = document.getElementById('search-count-label');
      const btnSearchDb = document.getElementById('btn-search-db');

      function filterUploadRows() {
        if (!searchInput) return;
        const query = searchInput.value.toLowerCase().trim();
        const rows = document.querySelectorAll('tr[id^="upload-row-"]');
        let visibleCount = 0;

        rows.forEach(function(row) {
          if (!query) {
            row.style.display = '';
            visibleCount++;
          } else {
            const text = row.textContent.toLowerCase();
            if (text.includes(query)) {
              row.style.display = '';
              visibleCount++;
            } else {
              row.style.display = 'none';
            }
          }
        });

        if (searchCountLabel) {
          if (query) {
            searchCountLabel.textContent = visibleCount + ' berkas cocok';
          } else {
            searchCountLabel.textContent = '';
          }
        }
      }

      if (searchInput) {
        searchInput.addEventListener('input', filterUploadRows);
      }

      if (btnResetSearch) {
        btnResetSearch.addEventListener('click', function() {
          if (searchInput) {
            searchInput.value = '';
            filterUploadRows();
            searchInput.focus();
          }
        });
      }

      if (btnSearchDb) {
        btnSearchDb.addEventListener('click', function() {
          const q = searchInput ? searchInput.value.trim() : '';
          if (!q) {
            showToast('Silakan masukkan kata kunci pencarian.', false, true);
            return;
          }
          filterUploadRows();
        });
      }

      // 1. Permanent Deletion handler (with iOS confirm dialog)
      document.addEventListener('click', async function(e) {
        const btn = e.target.closest('.btn-delete-perm');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name') || id;

        const confirmed = await window.showIosConfirm({
          title: 'Hapus Permanen dari Catbox?',
          message: 'Penghapusan dari server Catbox bersifat PERMANEN dan TIDAK DAPAT DIBATALKAN.\\n\\nBerkas "' + name + '" (' + id + ') akan dihapus selamanya dan tautan tidak akan bisa diakses lagi oleh siapapun.',
          confirmText: 'Hapus Permanen',
          cancelText: 'Batal',
          isDestructive: true,
          icon: 'danger'
        });

        if (!confirmed) {
          return;
        }

        const origText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Menghapus...';

        try {
          const res = await fetch('/' + panelPath + '/api/delete-permanent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ id })
          });

          if (res.status === 401) {
            window.location.href = '/' + panelPath + '/login';
            return;
          }

          const data = await res.json();
          if (data.success) {
            showToast(data.message, false, data.warning);
            const row = document.getElementById('upload-row-' + id);
            if (row) {
              row.style.opacity = '0.35';
              const actionCell = row.querySelector('td:last-child');
              if (actionCell) {
                actionCell.innerHTML = '<span style="font-size:0.75rem; color:#ef4444; font-weight:700;">Dihapus Permanen</span>';
              }
            }
            fetchLiveStats();
          } else {
            showToast(data.error?.message || 'Gagal menghapus berkas permanen.', true);
            btn.disabled = false;
            btn.textContent = origText;
          }
        } catch (err) {
          showToast('Terjadi kesalahan jaringan saat mencoba menghapus permanen.', true);
          btn.disabled = false;
          btn.textContent = origText;
        }
      });

      // 2. Health-Check Synchronization handler
      const btnSync = document.getElementById('btn-run-sync');
      const syncSpinner = document.getElementById('sync-spinner-icon');
      const syncText = document.getElementById('sync-btn-text');
      const syncSummaryContainer = document.getElementById('sync-summary-container');
      const syncLastLabel = document.getElementById('sync-last-checked-label');

      if (btnSync) {
        btnSync.addEventListener('click', async function() {
          btnSync.disabled = true;
          if (syncSpinner) syncSpinner.style.display = 'inline-block';
          if (syncText) syncText.textContent = 'Memeriksa ke Catbox...';

          try {
            const res = await fetch('/' + panelPath + '/api/sync-check', {
              method: 'POST',
              headers: { 'Accept': 'application/json' }
            });

            if (res.status === 401) {
              window.location.href = '/' + panelPath + '/login';
              return;
            }

            const data = await res.json();
            if (data.success) {
              if (syncLastLabel) {
                syncLastLabel.textContent = 'Terakhir diperiksa: Baru saja (' + new Date().toLocaleTimeString('id-ID') + ')';
              }

              if (data.brokenCount === 0) {
                syncSummaryContainer.innerHTML = '<div class="sync-banner sync-banner-ok"><div><strong>Semua Berkas Tersinkronisasi Aktif!</strong><div style="font-size: 0.8rem; margin-top: 0.25rem;">' + data.totalChecked + ' dari ' + data.totalChecked + ' berkas terbaru berhasil diverifikasi aktif di server Catbox (HTTP 200 OK). Tidak ada berkas yatim yang terdeteksi.</div></div></div>';
                showToast('Pemeriksaan selesai: Seluruh ' + data.totalChecked + ' berkas terverifikasi aktif di Catbox.', false);
              } else {
                let html = '<div class="sync-banner sync-banner-warn"><div><strong>Ditemukan Berkas Bermasalah: ' + data.brokenCount + ' Berkas Rusak / Yatim!</strong><div style="font-size: 0.8rem; margin-top: 0.25rem;">' + data.healthyCount + ' dari ' + data.totalChecked + ' berkas aktif. Terdapat <strong>' + data.brokenCount + ' tautan berkas</strong> yang sudah tidak ditemukan di Catbox (404/Error).</div></div></div>';
                html += '<div class="table-container" style="margin-top: 1rem;"><table><thead><tr><th>Berkas Bermasalah</th><th>Ukuran</th><th>Tautan Catbox Asli</th><th>Waktu Unggah</th><th>Aksi Perbaikan</th></tr></thead><tbody id="sync-broken-tbody">';
                data.brokenItems.forEach(function(item) {
                  html += '<tr id="sync-row-' + item.id + '"><td><div style="font-weight: 700; color: #f87171;">' + (item.name || item.id) + '</div><div style="font-size: 0.7rem; color: var(--muted);">' + item.id + '</div></td><td>' + (item.formattedSize || '-') + '</td><td><a href="' + item.shareUrl + '" target="_blank" class="link-view" style="font-size: 0.75rem; color: var(--muted);">' + item.shareUrl + '</a></td><td>Baru saja</td><td><button type="button" class="btn-delete-history" data-id="' + item.id + '" data-name="' + (item.name || item.id) + '">Hapus dari Riwayat</button></td></tr>';
                });
                html += '</tbody></table></div>';
                syncSummaryContainer.innerHTML = html;
                showToast('Pemeriksaan selesai: Ditemukan ' + data.brokenCount + ' berkas yatim/rusak yang tidak ada di Catbox.', false, true);
              }
            } else {
              showToast(data.error?.message || 'Gagal menjalankan pemeriksaan sinkronisasi.', true);
            }
          } catch (err) {
            showToast('Terjadi kesalahan koneksi saat menjalankan pemeriksaan sinkronisasi.', true);
          } finally {
            btnSync.disabled = false;
            if (syncSpinner) syncSpinner.style.display = 'none';
            if (syncText) syncText.textContent = 'Jalankan Pemeriksaan Sinkronisasi';
          }
        });
      }

      // 3. Delete History Only handler (without calling Catbox API)
      document.addEventListener('click', async function(e) {
        const btn = e.target.closest('.btn-delete-history');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name') || id;

        const confirmed = await window.showIosConfirm({
          title: 'Bersihkan dari Riwayat?',
          message: 'Hapus entri berkas "' + name + '" (' + id + ') dari riwayat repositori AirShare?\\n\\nFile ini memang sudah tidak ada di Catbox, aksi ini hanya membersihkan sisa riwayat di database.',
          confirmText: 'Bersihkan Entri',
          cancelText: 'Batal',
          isDestructive: false,
          icon: 'warning'
        });

        if (!confirmed) {
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Membersihkan...';

        try {
          const res = await fetch('/' + panelPath + '/api/delete-history-only', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ id })
          });

          if (res.status === 401) {
            window.location.href = '/' + panelPath + '/login';
            return;
          }

          const data = await res.json();
          if (data.success) {
            showToast(data.message, false);
            const syncRow = document.getElementById('sync-row-' + id);
            if (syncRow) {
              syncRow.remove();
            }
            const mainRow = document.getElementById('upload-row-' + id);
            if (mainRow) {
              mainRow.style.opacity = '0.35';
              const actionCell = mainRow.querySelector('td:last-child');
              if (actionCell) {
                actionCell.innerHTML = '<span style="font-size:0.75rem; color:#f59e0b; font-weight:700;">Dibersihkan dari Riwayat</span>';
              }
            }
            fetchLiveStats();
          } else {
            showToast(data.error?.message || 'Gagal membersihkan riwayat.', true);
            btn.disabled = false;
            btn.textContent = 'Hapus dari Riwayat';
          }
        } catch (err) {
          showToast('Terjadi kesalahan jaringan saat membersihkan riwayat.', true);
          btn.disabled = false;
          btn.textContent = 'Hapus dari Riwayat';
        }
      });

      // 4. Purge All Broken 404 files handler
      document.addEventListener('click', async function(e) {
        const btnPurgeAll = e.target.closest('#btn-purge-all-broken');
        if (!btnPurgeAll) return;

        const confirmed = await window.showIosConfirm({
          title: 'Bersihkan Seluruh Berkas Rusak (404)?',
          message: 'Bersihkan SEMUA berkas rusak (404) dan sisa data uji dari riwayat database & analitik?\\n\\nBerkas aktif yang valid akan tetap aman tersimpan.',
          confirmText: 'Bersihkan Semua (404)',
          cancelText: 'Batal',
          isDestructive: true,
          icon: 'danger'
        });

        if (!confirmed) {
          return;
        }

        btnPurgeAll.disabled = true;
        btnPurgeAll.textContent = 'Membersihkan Semua...';

        try {
          const res = await fetch('/' + panelPath + '/api/purge-broken', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
          });

          if (res.status === 401) {
            window.location.href = '/' + panelPath + '/login';
            return;
          }

          const data = await res.json();
          if (data.success) {
            showToast('Pembersihan selesai: ' + data.data.purgedCount + ' berkas 404/orphan dibersihkan.', false);
            syncSummaryContainer.innerHTML = '<div class="sync-banner sync-banner-ok"><div><strong>Semua Berkas Tersinkronisasi Aktif!</strong><div style="font-size: 0.8rem; margin-top: 0.25rem;">Pembersihan selesai. ' + data.data.healthyCount + ' berkas valid dipertahankan dan ' + data.data.purgedCount + ' berkas 404 dibersihkan.</div></div></div>';
            setTimeout(function() { window.location.reload(); }, 1200);
          } else {
            showToast(data.error?.message || 'Gagal membersihkan berkas rusak.', true);
            btnPurgeAll.disabled = false;
            btnPurgeAll.textContent = 'Bersihkan Semua Berkas Rusak (404)';
          }
        } catch (err) {
          showToast('Terjadi kesalahan koneksi saat membersihkan berkas rusak.', true);
          btnPurgeAll.disabled = false;
          btnPurgeAll.textContent = 'Bersihkan Semua Berkas Rusak (404)';
        }
      });

      // 5. Deleted Files Tab Handlers (Filter & Clear History)
      const searchDeletedInput = document.getElementById('search-deleted-input');
      const btnResetDeletedSearch = document.getElementById('btn-reset-deleted-search');
      const deletedSearchCountLabel = document.getElementById('deleted-search-count-label');
      const btnClearDeleted = document.getElementById('btn-clear-deleted-history');

      function filterDeletedRows() {
        if (!searchDeletedInput) return;
        const query = searchDeletedInput.value.toLowerCase().trim();
        const rows = document.querySelectorAll('tr[id^="deleted-row-"]');
        let visibleCount = 0;

        rows.forEach(function(row) {
          if (!query) {
            row.style.display = '';
            visibleCount++;
          } else {
            const text = row.textContent.toLowerCase();
            if (text.includes(query)) {
              row.style.display = '';
              visibleCount++;
            } else {
              row.style.display = 'none';
            }
          }
        });

        if (deletedSearchCountLabel) {
          if (query) {
            deletedSearchCountLabel.textContent = visibleCount + ' berkas cocok';
          } else {
            deletedSearchCountLabel.textContent = '';
          }
        }
      }

      if (searchDeletedInput) {
        searchDeletedInput.addEventListener('input', filterDeletedRows);
      }

      if (btnResetDeletedSearch) {
        btnResetDeletedSearch.addEventListener('click', function() {
          if (searchDeletedInput) {
            searchDeletedInput.value = '';
            filterDeletedRows();
            searchDeletedInput.focus();
          }
        });
      }

      if (btnClearDeleted) {
        btnClearDeleted.addEventListener('click', async function() {
          const confirmed = await window.showIosConfirm({
            title: 'Bersihkan Seluruh Riwayat Terhapus?',
            message: 'Seluruh arsip riwayat berkas terhapus akan dibersihkan dari database admin.',
            confirmText: 'Bersihkan Riwayat',
            cancelText: 'Batal',
            isDestructive: true,
            icon: 'danger'
          });

          if (!confirmed) {
            return;
          }

          btnClearDeleted.disabled = true;
          btnClearDeleted.textContent = 'Membersihkan...';

          try {
            const res = await fetch('/' + panelPath + '/api/clear-deleted-history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
            });

            if (res.status === 401) {
              window.location.href = '/' + panelPath + '/login';
              return;
            }

            const data = await res.json();
            if (data.success) {
              showToast(data.message, false);
              const tbody = document.getElementById('deleted-files-tbody');
              if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 2.5rem 1rem;"><div style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.35rem; color: var(--text);">Tidak ada riwayat berkas terhapus</div><div style="font-size: 0.8rem;">Riwayat arsip berkas terhapus telah dibersihkan secara penuh.</div></td></tr>';
              }
              const countBadge = document.getElementById('deleted-count-badge');
              if (countBadge) countBadge.textContent = '0 Berkas Tercatat';
              btnClearDeleted.style.display = 'none';
              const tabBtn = document.getElementById('tab-btn-terhapus');
              if (tabBtn) tabBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg><span>Berkas Terhapus (0)</span>';
              const sidebarBtnDesc = document.querySelector('#sidebar-btn-terhapus .sidebar-btn-desc');
              if (sidebarBtnDesc) sidebarBtnDesc.textContent = 'Arsip Terhapus (0)';
            } else {
              showToast(data.error?.message || 'Gagal membersihkan riwayat.', true);
              btnClearDeleted.disabled = false;
              btnClearDeleted.textContent = 'Bersihkan Seluruh Riwayat Terhapus';
            }
          } catch (err) {
            showToast('Terjadi kesalahan koneksi saat membersihkan riwayat.', true);
            btnClearDeleted.disabled = false;
            btnClearDeleted.textContent = 'Bersihkan Seluruh Riwayat Terhapus';
          }
        });
      }

      async function fetchLiveStats() {
        try {
          const res = await fetch('/' + panelPath + '/api/live-stats', {
            headers: { 'Accept': 'application/json' }
          });

          if (res.status === 401) {
            window.location.href = '/' + panelPath + '/login';
            return;
          }

          if (!res.ok) {
            throw new Error('HTTP ' + res.status);
          }

          const json = await res.json();
          if (!json || !json.today) return;

          // Update metric numbers
          const elUploads = document.getElementById('stat-uploads');
          if (elUploads && json.today.uploads !== undefined) {
            elUploads.textContent = Number(json.today.uploads).toLocaleString('id-ID');
          }

          const elBytes = document.getElementById('stat-bytes');
          if (elBytes && json.today.formattedBytes) {
            elBytes.textContent = json.today.formattedBytes;
          }

          const elViews = document.getElementById('stat-views');
          if (elViews && json.today.totalViews !== undefined) {
            elViews.textContent = Number(json.today.totalViews).toLocaleString('id-ID');
          }

          const elAvg = document.getElementById('stat-avg');
          if (elAvg && json.today.formattedAverageSize) {
            elAvg.textContent = json.today.formattedAverageSize;
          }

          const elTotalStored = document.getElementById('stat-total-stored');
          if (elTotalStored && json.totalItemsInRepo !== undefined) {
            const monitoredCount = (json.recentUploads && json.recentUploads.length) || 0;
            elTotalStored.textContent = 'Total Tersimpan: ' + Number(json.totalItemsInRepo).toLocaleString('id-ID') + ' item (' + monitoredCount + ' termonitor)';
          }

          // Update footer health status
          const elCatbox = document.getElementById('health-catbox');
          if (elCatbox && json.catbox) {
            if (json.catbox.available) {
              elCatbox.innerHTML = '<span class="status-indicator status-ok"></span><span>Catbox Upstream: <strong>Tersedia (' + (json.catbox.latencyMs || 0) + 'ms)</strong></span>';
            } else {
              elCatbox.innerHTML = '<span class="status-indicator status-warn"></span><span>Catbox Upstream: <strong style="color: #f87171;">Tidak Tersedia — Periksa Status Catbox</strong></span>';
            }
          }

          const elStorage = document.getElementById('health-storage');
          if (elStorage && json.redis) {
            const isOk = json.redis.connected || (!json.redis.configured);
            const dotClass = isOk ? 'status-ok' : 'status-warn';
            elStorage.innerHTML = '<span class="status-indicator ' + dotClass + '"></span><span>Storage Backend: <strong>' + (json.redis.mode || 'In-Memory (Fallback)') + '</strong></span>';
          }

          // Update sync badge to success
          if (badgeDot) {
            badgeDot.style.background = 'var(--success)';
            badgeDot.style.boxShadow = '0 0 8px var(--success)';
          }
          if (badgeTitle) badgeTitle.textContent = 'Diperbarui otomatis setiap 20 detik';
          if (badgeTime) {
            const now = new Date();
            const timeStr = String(now.getHours()).padStart(2, '0') + ':' +
                            String(now.getMinutes()).padStart(2, '0') + ':' +
                            String(now.getSeconds()).padStart(2, '0');
            badgeTime.textContent = 'Terakhir sinkron: ' + timeStr;
          }
        } catch (err) {
          if (badgeDot) {
            badgeDot.style.background = '#ef4444';
            badgeDot.style.boxShadow = '0 0 8px #ef4444';
          }
          if (badgeTitle) badgeTitle.textContent = 'Gagal memperbarui — periksa koneksi';
        }
      }

      setInterval(fetchLiveStats, 20000);
    })();

    ${getOperationalPanelScripts(fullAdminPath)}

    ${THEME_STORAGE_LISTENER_SCRIPT}
  </script>
</body>
</html>`;

    res.status(200).send(html);
    } catch (err: unknown) {
      console.error('[RENDER_DASHBOARD_ERROR]', err);
      res.status(500).send('<!DOCTYPE html><html><body><h1>500 Internal Server Error</h1><p>Gagal memuat dashboard admin. Silakan periksa koneksi dan coba beberapa saat lagi.</p></body></html>');
    }
  },

  /**
   * GET /{ADMIN_PANEL_PATH}/api/live-stats
   * Returns fresh real-time dashboard stats for polling updates.
   * Strictly protected by requireAdminAuth.
   */
  async getLiveStats(req: Request, res: Response): Promise<void> {
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

      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        today: todayStats,
        totalItemsInRepo,
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
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/delete-permanent
   * Irreversibly deletes file from Catbox upstream and removes it from AirShare database/analytics.
   * Strictly protected by requireAdminAuth.
   */
  async deletePermanent(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.body || {};
      if (!id || typeof id !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_ID', message: 'Parameter ID berkas wajib diisi.' },
        });
        return;
      }

      const mediaRepo = getMediaRepository();
      // Retrieve file record via getByIdForAdmin (never expose sessionId in response)
      const item = await mediaRepo.getByIdForAdmin(id);

      // If item not found in repository, still attempt Catbox deletion if id is valid
      const targetUrlOrId = item ? (item.shareUrl || item.id) : id;
      const itemName = item?.name || id;

      // Call Catbox storage provider delete (uses reqtype=deletefiles & CATBOX_USERHASH)
      const catboxResult = await storageProvider.delete(targetUrlOrId);

      // Clean up all database keys in MediaRepository (Redis / In-memory)
      await mediaRepo.deleteForAdmin(id);

      // Clean up analytics recent uploads cache and all daily stat footprints
      await analyticsRepository.removeRecentUpload(id);
      await analyticsRepository.removeFileFromAllStats(id);
      await analyticsRepository.recordDeletion(1);

      // Clean up sync check broken item if recorded
      await removeSyncCheckItem(id);

      // Record into Deleted Files Archive
      await deletedFilesRepository.recordDeleted({
        id,
        name: itemName,
        formattedSize: item?.formattedSize || '-',
        type: (item?.type as any) || 'file',
        shareUrl: item?.shareUrl || targetUrlOrId,
        deletedAt: Date.now(),
        deletedBy: 'admin',
        reason: 'Admin menghapus berkas permanen dari dashboard',
      });

      // Record Security Audit Log
      const clientIp = getClientIp(req);
      await auditLogRepository.recordAction({
        type: 'PERMANENT_DELETE',
        detail: `Hapus permanen berkas "${itemName}" (ID: ${id}) dari Catbox & database. Status Catbox: ${
          catboxResult.success ? 'BERHASIL' : 'GAGAL (' + catboxResult.message + ')'
        }`,
        ip: clientIp,
      });

      console.log(
        `[ADMIN AUDIT] Permanent delete media ID: ${id}, name: "${itemName}", Catbox response: ${
          catboxResult.success ? 'SUCCESS' : catboxResult.message
        }`
      );

      res.json({
        success: true,
        message: catboxResult.success
          ? `Berkas "${itemName}" berhasil dihapus permanen dari server Catbox dan database AirShare.`
          : `Berkas "${itemName}" dihapus dari database AirShare (${catboxResult.message}).`,
        catboxDeleted: catboxResult.success,
        warning: !catboxResult.success,
      });
    } catch (err: unknown) {
      console.error('[DELETE_PERMANENT_ERROR]', err);
      res.status(500).json({
        success: false,
        error: { code: 'DELETE_FAILED', message: 'Gagal menghapus berkas permanen. Silakan coba lagi.' },
      });
    }
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/delete-history-only
   * Cleans up broken or orphan file metadata from AirShare database without calling Catbox.
   * Strictly protected by requireAdminAuth.
   */
  async deleteHistoryOnly(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.body || {};
      if (!id || typeof id !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_ID', message: 'Parameter ID berkas wajib diisi.' },
        });
        return;
      }

      const clientIp = getClientIp(req);
      const mediaRepo = getMediaRepository();
      const item = await mediaRepo.getByIdForAdmin(id);

      await mediaRepo.deleteForAdmin(id);
      await analyticsRepository.removeRecentUpload(id);
      await analyticsRepository.removeFileFromAllStats(id);
      await analyticsRepository.recordDeletion(1);
      await removeSyncCheckItem(id);

      await deletedFilesRepository.recordDeleted({
        id,
        name: item?.name || id,
        formattedSize: item?.formattedSize || '-',
        type: (item?.type as any) || 'file',
        shareUrl: item?.shareUrl || '#',
        deletedAt: Date.now(),
        deletedBy: 'admin',
        reason: 'Admin membersihkan riwayat database lokal',
      });

      await auditLogRepository.recordAction({
        type: 'HISTORY_DELETE',
        detail: `Pembersihan riwayat database lokal untuk berkas ID: ${id}`,
        ip: clientIp,
      });

      console.log(`[ADMIN AUDIT] History-only cleanup for media ID: ${id}`);

      res.json({
        success: true,
        message: `Berkas ${id} berhasil dibersihkan dari riwayat database AirShare.`,
      });
    } catch (err: unknown) {
      console.error('[DELETE_HISTORY_ONLY_ERROR]', err);
      res.status(500).json({
        success: false,
        error: { code: 'CLEANUP_FAILED', message: 'Gagal membersihkan riwayat berkas. Silakan coba lagi.' },
      });
    }
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/sync-check
   * Verifies recent files on Catbox upstream to identify active vs broken/orphan files.
   * Strictly protected by requireAdminAuth.
   */
  async runSyncCheck(req: Request, res: Response): Promise<void> {
    try {
      const clientIp = getClientIp(req);
      // Check recent uploads up to 50 items
      const recentUploads = await analyticsRepository.getRecentUploads(50);
      if (!recentUploads || recentUploads.length === 0) {
        const emptySummary: SyncCheckSummary = {
          timestamp: Date.now(),
          totalChecked: 0,
          healthyCount: 0,
          brokenCount: 0,
          brokenItems: [],
        };
        await saveLastSyncCheck(emptySummary);
        res.json({
          success: true,
          ...emptySummary,
        });
        return;
      }

      const filesToCheck = recentUploads.map((u) => ({
        id: u.id,
        shareUrl: u.shareUrl,
        name: u.name,
        formattedSize: u.formattedSize,
        createdAt: u.createdAt,
      }));

      // Verify batch with concurrency limit of 5 to avoid overwhelming Catbox
      const batchResults = await verifyFilesBatch(filesToCheck, 5);
      const brokenItems = batchResults
        .filter((r) => !r.exists)
        .map((r) => r.item);
      const healthyCount = batchResults.filter((r) => r.exists).length;

      const summary: SyncCheckSummary = {
        timestamp: Date.now(),
        totalChecked: batchResults.length,
        healthyCount,
        brokenCount: brokenItems.length,
        brokenItems,
      };
      await saveLastSyncCheck(summary);

      await auditLogRepository.recordAction({
        type: 'SYNC_CHECK',
        detail: `Pemeriksaan sinkronisasi selesai: ${summary.totalChecked} berkas diperiksa, ${summary.healthyCount} sehat, ${summary.brokenCount} broken/hilang`,
        ip: clientIp,
      });

      console.log(
        `[ADMIN AUDIT] Sync check completed: ${summary.totalChecked} checked, ${summary.healthyCount} healthy, ${summary.brokenCount} broken.`
      );

      res.json({
        success: true,
        timestamp: summary.timestamp,
        totalChecked: summary.totalChecked,
        healthyCount: summary.healthyCount,
        brokenCount: summary.brokenCount,
        brokenItems: summary.brokenItems,
      });
    } catch (err: unknown) {
      console.error('[RUN_SYNC_CHECK_ERROR]', err);
      res.status(500).json({
        success: false,
        error: { code: 'SYNC_CHECK_FAILED', message: 'Gagal menjalankan pemeriksaan sinkronisasi berkas. Silakan coba lagi.' },
      });
    }
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/purge-broken
   * Verifies upstream Catbox files and immediately purges all 404/broken/orphan entries
   * from both MediaRepository and Analytics history.
   */
  async purgeBrokenFiles(req: Request, res: Response): Promise<void> {
    try {
      const clientIp = getClientIp(req);
      const mediaRepo = getMediaRepository();
      const recentUploads = await analyticsRepository.getRecentUploads(100);

      const filesToCheck = recentUploads.map((u) => ({
        id: u.id,
        shareUrl: u.shareUrl,
        name: u.name,
        formattedSize: u.formattedSize,
        createdAt: u.createdAt,
      }));

      const batchResults = await verifyFilesBatch(filesToCheck, 5);
      let purgedCount = 0;

      for (const resItem of batchResults) {
        if (!resItem.exists) {
          await mediaRepo.deleteForAdmin(resItem.item.id);
          await analyticsRepository.removeRecentUpload(resItem.item.id);
          await analyticsRepository.removeFileFromAllStats(resItem.item.id);
          await removeSyncCheckItem(resItem.item.id);
          await deletedFilesRepository.recordDeleted({
            id: resItem.item.id,
            name: resItem.item.name || resItem.item.id,
            formattedSize: resItem.item.formattedSize || '-',
            type: 'file',
            shareUrl: resItem.item.shareUrl || '#',
            deletedAt: Date.now(),
            deletedBy: 'sync_purge',
            reason: 'Pembersihan otomatis berkas 404 / broken link di server Catbox',
          });
          purgedCount++;
        }
      }

      if (purgedCount > 0) {
        await analyticsRepository.recordDeletion(purgedCount);
      }

      // Also purge any test fixture artifacts from runtime
      await analyticsRepository.purgeTestData();
      if ('clearTestData' in mediaRepo && typeof (mediaRepo as any).clearTestData === 'function') {
        (mediaRepo as any).clearTestData();
      }

      const healthyCount = batchResults.filter((r) => r.exists).length;
      const summary: SyncCheckSummary = {
        timestamp: Date.now(),
        totalChecked: batchResults.length,
        healthyCount,
        brokenCount: 0,
        brokenItems: [],
      };
      await saveLastSyncCheck(summary);

      await auditLogRepository.recordAction({
        type: 'SYNC_CHECK',
        detail: `Pembersihan berkas rusak (404) selesai: ${purgedCount} berkas 404/orphan dihapus dari database & analitik, ${healthyCount} berkas valid dipertahankan.`,
        ip: clientIp,
      });

      res.json({
        success: true,
        data: {
          purgedCount,
          healthyCount,
          totalChecked: batchResults.length,
        },
      });
    } catch (err: unknown) {
      console.error('[PURGE_BROKEN_FILES_ERROR]', err);
      res.status(500).json({
        success: false,
        error: { code: 'PURGE_FAILED', message: 'Gagal membersihkan berkas broken link. Silakan coba lagi.' },
      });
    }
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/config
   * Updates dynamic system configurations (limits, announcement banner, feature flags).
   */
  async updateConfig(req: Request, res: Response): Promise<void> {
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
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/maintenance
   * Updates the maintenance mode kill switch (3 levels).
   */
  async toggleMaintenance(req: Request, res: Response): Promise<void> {
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
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/revoke-session
   * Revokes a specific active admin session.
   */
  async revokeSession(req: Request, res: Response): Promise<void> {
    try {
      const clientIp = getClientIp(req);
      const { tokenToRevoke } = req.body || {};
      if (!tokenToRevoke || typeof tokenToRevoke !== 'string') {
        res.status(400).json({ success: false, error: { message: 'Token sesi wajib diberikan.' } });
        return;
      }

      await revokeAdminSession(tokenToRevoke);

      await auditLogRepository.recordAction({
        type: 'SESSION_REVOKE',
        detail: `Mencabut sesi admin dengan token ${tokenToRevoke.substring(0, 8)}...`,
        ip: clientIp,
        adminTokenPreview: `${tokenToRevoke.substring(0, 8)}...`,
      });

      res.json({
        success: true,
        message: 'Sesi admin berhasil dicabut.',
      });
    } catch (err: unknown) {
      console.error('[REVOKE_SESSION_ERROR]', err);
      res.status(500).json({
        success: false,
        error: { code: 'REVOKE_FAILED', message: 'Gagal mencabut sesi admin. Silakan coba lagi.' },
      });
    }
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/revoke-all-sessions
   * Revokes all active admin sessions except current one.
   */
  async revokeAllSessions(req: Request, res: Response): Promise<void> {
    try {
      const clientIp = getClientIp(req);
      const currentToken = req.cookies?.[ADMIN_COOKIE_NAME];
      const count = await revokeAllAdminSessions(currentToken);

      await auditLogRepository.recordAction({
        type: 'SESSION_REVOKE_ALL',
        detail: `Mencabut SEMUA sesi admin lain (${count} sesi ditutup)`,
        ip: clientIp,
      });

      res.json({
        success: true,
        revokedCount: count,
        message: `Berhasil mencabut ${count} sesi admin lain.`,
      });
    } catch (err: unknown) {
      console.error('[REVOKE_ALL_SESSIONS_ERROR]', err);
      res.status(500).json({
        success: false,
        error: { code: 'REVOKE_ALL_FAILED', message: 'Gagal mencabut sesi admin lainnya. Silakan coba lagi.' },
      });
    }
  },

  /**
   * GET /{ADMIN_PANEL_PATH}/api/search
   * Search files in repository by name, ID, or filename.
   */
  async searchFiles(req: Request, res: Response): Promise<void> {
    try {
      const query = String(req.query.q || '').trim().toLowerCase();
      if (!query) {
        res.json({ success: true, data: { items: [], total: 0 } });
        return;
      }

      const allRecent = await analyticsRepository.getRecentUploads(500);
      const matched = allRecent.filter(
        (item) =>
          item.id.toLowerCase().includes(query) ||
          (item.name && item.name.toLowerCase().includes(query)) ||
          (item.originalFileName && item.originalFileName.toLowerCase().includes(query))
      );

      const enriched = await Promise.all(
        matched.map(async (m) => {
          const views = await analyticsRepository.getViewCount(m.id);
          return {
            id: m.id,
            name: m.name,
            type: m.type,
            size: m.size,
            formattedSize: m.formattedSize,
            createdAt: m.createdAt,
            uploaderCountryCode: m.uploaderCountryCode,
            views,
            shareUrl: m.shareUrl,
          };
        })
      );

      res.json({
        success: true,
        data: {
          query,
          items: enriched,
          total: enriched.length,
        },
      });
    } catch (err: unknown) {
      console.error('[SEARCH_FILES_ERROR]', err);
      res.status(500).json({
        success: false,
        error: { code: 'SEARCH_FAILED', message: 'Gagal mencari berkas. Silakan coba lagi.' },
      });
    }
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/bulk-cleanup/preview
   * Previews files matching age and view count criteria.
   */
  async previewBulkCleanup(req: Request, res: Response): Promise<void> {
    try {
      const olderThanDays = Number(req.body?.olderThanDays) || 0;
      const maxViews = req.body?.maxViews !== undefined ? Number(req.body.maxViews) : 0;

      const now = Date.now();
      const cutoffTime = olderThanDays > 0 ? now - olderThanDays * 24 * 60 * 60 * 1000 : now;

      const allRecent = await analyticsRepository.getRecentUploads(500);

      const candidates = [];
      let totalBytes = 0;

      for (const item of allRecent) {
        if (olderThanDays > 0 && item.createdAt > cutoffTime) {
          continue;
        }
        const views = await analyticsRepository.getViewCount(item.id);
        if (views <= maxViews) {
          candidates.push({
            id: item.id,
            name: item.name,
            formattedSize: item.formattedSize,
            size: item.size || 0,
            createdAt: item.createdAt,
            views,
          });
          totalBytes += item.size || 0;
        }
      }

      res.json({
        success: true,
        data: {
          total: candidates.length,
          totalBytes,
          formattedTotalBytes: formatBytes(totalBytes),
          items: candidates.slice(0, 100),
        },
      });
    } catch (err: unknown) {
      console.error('[PREVIEW_BULK_CLEANUP_ERROR]', err);
      res.status(500).json({
        success: false,
        error: { code: 'PREVIEW_FAILED', message: 'Gagal memuat pratinjau pembersihan massal. Silakan coba lagi.' },
      });
    }
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/bulk-cleanup
   * Irreversibly deletes files matching criteria from Catbox and database.
   */
  async executeBulkCleanup(req: Request, res: Response): Promise<void> {
    try {
      const { olderThanDays, maxViews, confirm } = req.body || {};
      if (!confirm) {
        res.status(400).json({
          success: false,
          error: { code: 'CONFIRMATION_REQUIRED', message: 'Konfirmasi eksplisit diperlukan untuk eksekusi pembersihan massal.' },
        });
        return;
      }

      const clientIp = getClientIp(req);
      const days = Number(olderThanDays) || 0;
      const viewsLimit = maxViews !== undefined ? Number(maxViews) : 0;
      const now = Date.now();
      const cutoffTime = days > 0 ? now - days * 24 * 60 * 60 * 1000 : now;

      const mediaRepo = getMediaRepository();
      const allRecent = await analyticsRepository.getRecentUploads(500);

      let succeeded = 0;
      let failed = 0;
      let freedBytes = 0;

      for (const item of allRecent) {
        if (days > 0 && item.createdAt > cutoffTime) {
          continue;
        }
        const views = await analyticsRepository.getViewCount(item.id);
        if (views <= viewsLimit) {
          try {
            await storageProvider.delete(item.shareUrl || item.id);
            await mediaRepo.deleteForAdmin(item.id);
            await analyticsRepository.removeRecentUpload(item.id);
            await analyticsRepository.removeFileFromAllStats(item.id);
            await removeSyncCheckItem(item.id);
            await deletedFilesRepository.recordDeleted({
              id: item.id,
              name: item.name || item.id,
              formattedSize: item.formattedSize || '-',
              type: (item.type as any) || 'file',
              shareUrl: item.shareUrl || '#',
              deletedAt: Date.now(),
              deletedBy: 'bulk_cleanup',
              reason: `Pembersihan massal (kriteria usia > ${days} hari, views <= ${viewsLimit})`,
            });
            succeeded++;
            freedBytes += item.size || 0;
          } catch (err) {
            failed++;
          }
        }
      }

      if (succeeded > 0) {
        await analyticsRepository.recordDeletion(succeeded);
      }

      await auditLogRepository.recordAction({
        type: 'BULK_CLEANUP',
        detail: `Pembersihan massal (Kriteria: usia > ${days} hari, views <= ${viewsLimit}): Berhasil menghapus ${succeeded} berkas, gagal ${failed}. Total penyimpanan dibebaskan: ${formatBytes(freedBytes)}`,
        ip: clientIp,
      });

      res.json({
        success: true,
        data: {
          succeeded,
          failed,
          freedBytes,
          formattedFreedBytes: formatBytes(freedBytes),
        },
      });
    } catch (err: unknown) {
      console.error('[EXECUTE_BULK_CLEANUP_ERROR]', err);
      res.status(500).json({
        success: false,
        error: { code: 'BULK_CLEANUP_FAILED', message: 'Gagal menjalankan pembersihan massal. Silakan coba lagi.' },
      });
    }
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/clear-deleted-history
   * Clears all deleted files archive history.
   * Strictly protected by requireAdminAuth.
   */
  async clearDeletedHistory(req: Request, res: Response): Promise<void> {
    try {
      const clientIp = getClientIp(req);
      const count = await deletedFilesRepository.clearAll();

      await auditLogRepository.recordAction({
        type: 'HISTORY_DELETE',
        detail: `Admin membersihkan seluruh arsip riwayat berkas terhapus (${count} arsip dibersihkan)`,
        ip: clientIp,
      });

      res.json({
        success: true,
        clearedCount: count,
        message: `Berhasil membersihkan ${count} riwayat berkas terhapus.`,
      });
    } catch (err: unknown) {
      console.error('[CLEAR_DELETED_HISTORY_ERROR]', err);
      res.status(500).json({
        success: false,
        error: { code: 'CLEAR_HISTORY_FAILED', message: 'Gagal membersihkan riwayat berkas terhapus. Silakan coba lagi.' },
      });
    }
  },

  /**
   * GET /{ADMIN_PANEL_PATH}/api/deleted-files
   * Returns list of recently deleted files for admin audit.
   * Strictly protected by requireAdminAuth.
   */
  async getDeletedFiles(req: Request, res: Response): Promise<void> {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
      const items = await deletedFilesRepository.getDeletedFiles(limit);
      res.json({
        success: true,
        data: {
          items,
          total: items.length,
        },
      });
    } catch (err: unknown) {
      console.error('[GET_DELETED_FILES_ERROR]', err);
      res.status(500).json({
        success: false,
        error: { code: 'GET_DELETED_FILES_FAILED', message: 'Gagal memuat daftar berkas terhapus. Silakan coba lagi.' },
      });
    }
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/ai-recommendations
   * Real-time executive summary and strategic recommendations generated by Gemini 3.8 Flash.
   * Includes automated graceful fallback to heuristic engine if API key is not configured or fails.
   */
  async getAiRecommendations(req: Request, res: Response): Promise<void> {
    const todayStr = getTodayDateString();

    try {
      const [todayStats, weeklyTrend, topFiles, catboxHealth, redisHealth, totalItems] = await Promise.all([
        analyticsRepository.getDailySummary(todayStr),
        analyticsRepository.getWeeklyTrend(),
        analyticsRepository.getTopFiles(10),
        checkCatboxHealth(),
        checkRedisHealth(),
        analyticsRepository.getTotalItemsEver(),
      ]);

      const heuristicRecs = generateRecommendations(todayStats, weeklyTrend, topFiles);
      const fallbackSummary = `Sistem mencatat total **${todayStats.uploads} unggahan** (${todayStats.formattedBytes}) dengan **${todayStats.totalViews} kunjungan** pada hari ini. Status penyimpanan Catbox saat ini: \`${catboxHealth.available ? 'TERSEDIA' : 'TERGANGGU'}\`.`;

      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey || apiKey.trim().length === 0) {
        res.json({
          success: true,
          isAi: false,
          model: 'heuristic-engine',
          summary: fallbackSummary,
          recommendations: heuristicRecs,
          generatedAt: Date.now(),
          error: 'GEMINI_API_KEY belum dikonfigurasi di environment hosting. Menampilkan hasil analisis heuristik bawaan.',
        });
        return;
      }

      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({
          apiKey: apiKey.trim(),
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
            timeout: 20000,
          },
        });

        const prompt = `Anda adalah asisten AI Analitik Sistem dan Infrastruktur untuk AirShare Pro (platform berbagi berkas media berkinerja tinggi).
Analisis metrik sistem real-time berikut ini dan berikan ringkasan eksekutif beserta rekomendasi strategis dalam format JSON:

DATA SISTEM REAL-TIME:
- Tanggal: ${todayStats.date}
- Unggahan Hari Ini: ${todayStats.uploads} berkas (${todayStats.formattedBytes})
- Rata-rata Ukuran Berkas: ${todayStats.formattedAverageSize}
- Total Berkas Tersimpan Aktif: ${totalItems} berkas
- Total Kunjungan Share Hari Ini: ${todayStats.totalViews} kali
- Distribusi Tipe Media: ${JSON.stringify(todayStats.byType)}
- Distribusi Negara Pengunggah: ${JSON.stringify(todayStats.byCountry)}
- Berkas Paling Sering Dilihat: ${JSON.stringify(topFiles.map((f) => ({ id: f.id, views: f.views })))}
- Status Catbox Storage: ${catboxHealth.available ? 'TERSEDIA' : 'TERGANGGU'} (${catboxHealth.latencyMs !== null ? `${catboxHealth.latencyMs}ms` : 'N/A'})
- Status Upstash Redis: ${redisHealth.connected ? 'TERHUBUNG' : (redisHealth.configured ? 'DISCONNECTED' : 'LOCAL IN-MEMORY')} (${redisHealth.latencyMs !== null ? `${redisHealth.latencyMs}ms` : 'N/A'})
- Tren 7 Hari Terakhir: ${weeklyTrend.map((w) => `${w.date}: ${w.uploads} unggahan (${w.formattedBytes})`).join(', ')}

INSTRUKSI OUTPUT:
Hasilkan respons JSON valid dengan struktur:
{
  "summary": "Ringkasan eksekutif 2-3 kalimat mengenai status sistem, tren volume beban, dan efisiensi penyimpanan saat ini. Boleh menggunakan format Markdown (seperti **bold** atau \`code\`).",
  "recommendations": [
    "Rekomendasi 1 yang terarah (boleh gunakan **bold** dan \`code\`)",
    "Rekomendasi 2",
    "Rekomendasi 3",
    "Rekomendasi 4"
  ]
}
Pastikan rekomendasi berfokus pada optimasi bandwidth, proteksi kuota penyimpanan, retensi data, dan keamanan operasional.`;

        let usedModel = GEMINI_MODEL_NAME;
        let response: any;
        try {
          response = await ai.models.generateContent({
            model: usedModel,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
            },
          });
        } catch (initialErr: any) {
          // If the configured model failed and wasn't gemini-2.5-flash, attempt fallback to gemini-2.5-flash
          if (usedModel !== 'gemini-2.5-flash') {
            console.warn(`[GEMINI_RECOMMENDATION_WARN] Model ${usedModel} mengalami kendala (${initialErr?.message || initialErr}), mencoba model cadangan gemini-2.5-flash...`);
            usedModel = 'gemini-2.5-flash';
            response = await ai.models.generateContent({
              model: usedModel,
              contents: prompt,
              config: {
                responseMimeType: 'application/json',
              },
            });
          } else {
            throw initialErr;
          }
        }

        const rawText = response?.text?.trim() || '';
        let parsedResponse: { summary?: string; recommendations?: string[] } | null = null;
        try {
          parsedResponse = JSON.parse(rawText);
        } catch {
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedResponse = JSON.parse(jsonMatch[0]);
          }
        }

        if (parsedResponse && (parsedResponse.summary || (Array.isArray(parsedResponse.recommendations) && parsedResponse.recommendations.length > 0))) {
          res.json({
            success: true,
            isAi: true,
            model: usedModel,
            summary: parsedResponse.summary || 'Sistem beroperasi normal dengan parameter kapasitas optimal.',
            recommendations: Array.isArray(parsedResponse.recommendations) && parsedResponse.recommendations.length > 0
              ? parsedResponse.recommendations
              : heuristicRecs,
            generatedAt: Date.now(),
          });
          return;
        }

        res.json({
          success: true,
          isAi: false,
          model: 'heuristic-engine',
          summary: fallbackSummary,
          recommendations: heuristicRecs,
          generatedAt: Date.now(),
          error: 'Respon dari Gemini API tidak dalam format yang diharapkan. Menampilkan hasil analisis heuristik sebagai gantinya.',
        });
        return;
      } catch (geminiErr: any) {
        console.warn('[GEMINI_RECOMMENDATION_WARN] Gagal menghubungi Gemini API, fallback ke heuristik:', geminiErr?.message || geminiErr);
        res.json({
          success: true,
          isAi: false,
          model: 'heuristic-engine',
          summary: fallbackSummary,
          recommendations: heuristicRecs,
          generatedAt: Date.now(),
          error: `Gemini API mengalami kendala: ${geminiErr?.message || 'Gagal terhubung ke layanan AI.'}. Menampilkan hasil analisis heuristik sebagai gantinya.`,
        });
        return;
      }
    } catch (err: any) {
      console.error('[AI_RECOMMENDATIONS_ERROR]', err);
      res.status(500).json({
        success: false,
        error: 'Gagal menghasilkan analisis rekomendasi AI. Silakan coba beberapa saat lagi.',
      });
    }
  },
};

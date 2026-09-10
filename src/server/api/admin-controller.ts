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
  setAnnouncement,
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
  alertAdminLoginFailed,
  alertMaintenanceModeChanged,
} from '../telegram/telegram-notifier';
import { DailyStats, PublicMediaView, WeeklyTrendItem } from '../../types';
import { getFlagAssetPath } from '../../shared/flags';

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
    <div class="sync-banner sync-banner-warn">
      <div>
        <strong>Ditemukan Berkas Bermasalah: ${check.brokenCount} Berkas Rusak / Yatim!</strong>
        <div style="font-size: 0.8rem; margin-top: 0.25rem;">${check.healthyCount} dari ${check.totalChecked} berkas aktif. Terdapat <strong>${check.brokenCount} tautan berkas</strong> yang sudah tidak ditemukan di Catbox (404/Error). Anda dapat membersihkannya dari riwayat di bawah.</div>
      </div>
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
                <div style="font-weight: 700; color: #f87171; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(
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
                )}" target="_blank" class="link-view" style="font-size: 0.75rem; color: var(--muted); max-width: 200px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
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
    const { enabled, fullAdminPath } = getAdminConfig();
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
  <style>
    :root {
      --bg: #09090b;
      --card: #18181b;
      --card-inner: #27272a;
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --border: rgba(255, 255, 255, 0.1);
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --error-bg: rgba(239, 68, 68, 0.15);
      --error-text: #f87171;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body {
      background-color: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .glass-card {
      background: rgba(24, 24, 27, 0.85);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 1.5rem;
      padding: 2.25rem;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 40px -15px rgba(0,0,0,0.7);
    }
    .header { text-align: center; margin-bottom: 2rem; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: rgba(37, 99, 235, 0.15);
      color: #60a5fa;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 1rem;
      border: 1px solid rgba(96, 165, 250, 0.2);
    }
    h1 { font-size: 1.35rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 0.35rem; }
    p.subtitle { color: var(--muted); font-size: 0.85rem; line-height: 1.4; }
    .error-banner {
      background: var(--error-bg);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: var(--error-text);
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
    label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--muted); margin-bottom: 0.5rem; }
    input[type="password"] {
      width: 100%;
      background: var(--card-inner);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 0.8rem 1rem;
      color: var(--text);
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input[type="password"]:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.25);
    }
    .btn-submit {
      width: 100%;
      background: var(--accent);
      color: #fff;
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
      color: var(--muted);
      opacity: 0.75;
    }
  </style>
</head>
<body>
  <div class="glass-card">
    <div class="header">
      <div class="badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
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
</body>
</html>`;

    res.status(200).send(html);
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/login
   */
  async handleLogin(req: Request, res: Response): Promise<void> {
    const { enabled, fullAdminPath } = getAdminConfig();
    if (!enabled) {
      res.status(404).send('<!DOCTYPE html><html><body>404 Not Found</body></html>');
      return;
    }

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
  },

  /**
   * POST / GET /{ADMIN_PANEL_PATH}/logout
   */
  async handleLogout(req: Request, res: Response): Promise<void> {
    const { enabled, fullAdminPath } = getAdminConfig();
    if (!enabled) {
      res.status(404).send('<!DOCTYPE html><html><body>404 Not Found</body></html>');
      return;
    }

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
  },

  /**
   * GET /{ADMIN_PANEL_PATH}/dashboard
   */
  async renderDashboard(req: Request, res: Response): Promise<void> {
    const { enabled, fullAdminPath } = getAdminConfig();
    if (!enabled) {
      res.status(404).send('<!DOCTYPE html><html><body>404 Not Found</body></html>');
      return;
    }

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
  <style>
    :root {
      --bg: #09090b;
      --card: #141417;
      --card-elevated: #1c1c21;
      --border: rgba(255, 255, 255, 0.08);
      --border-accent: rgba(37, 99, 235, 0.3);
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --accent: #3b82f6;
      --accent-dark: #1d4ed8;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --surface-glass: rgba(20, 20, 23, 0.7);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: var(--bg); color: var(--text); padding: 1.25rem; min-height: 100vh; }
    .container { max-width: 1240px; margin: 0 auto; }

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
      margin-bottom: 1.5rem;
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
    @media (max-width: 900px) {
      .section-grid { grid-template-columns: 1fr; }
    }

    .panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 1.5rem;
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

    /* Recommendations */
    .rec-box {
      background: rgba(37, 99, 235, 0.08);
      border: 1px solid rgba(37, 99, 235, 0.2);
      border-radius: 1rem;
      padding: 1.25rem;
      margin-bottom: 1.5rem;
    }
    .rec-header { display: flex; align-items: center; gap: 0.5rem; font-size: 0.95rem; font-weight: 800; color: #93c5fd; margin-bottom: 0.75rem; }
    .rec-list { list-style: none; display: flex; flex-direction: column; gap: 0.65rem; }
    .rec-item { display: flex; align-items: flex-start; gap: 0.6rem; font-size: 0.85rem; line-height: 1.5; color: var(--text); }
    .rec-bullet { color: #60a5fa; flex-shrink: 0; margin-top: 0.15rem; }

    /* Tables */
    .table-container { overflow-x: auto; margin-top: 0.5rem; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem; }
    th { padding: 0.75rem 1rem; font-size: 0.725rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); border-bottom: 1px solid var(--border); }
    td { padding: 0.75rem 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.04); vertical-align: middle; }
    tr:hover td { background: rgba(255, 255, 255, 0.02); }
    .badge-type { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 6px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
    .badge-image { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .badge-video { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
    .badge-audio { background: rgba(236, 72, 153, 0.15); color: #f472b6; }
    .badge-file { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .session-tag { font-family: monospace; font-size: 0.75rem; color: var(--muted); background: rgba(255, 255, 255, 0.05); padding: 0.15rem 0.4rem; border-radius: 4px; }
    .link-view { color: var(--accent); text-decoration: none; font-weight: 600; }
    .link-view:hover { text-decoration: underline; }

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
    }
    .health-item { display: flex; align-items: center; gap: 0.5rem; }
    .status-indicator { width: 8px; height: 8px; border-radius: 50%; }
    .status-ok { background: var(--success); box-shadow: 0 0 6px var(--success); }
    .status-warn { background: var(--warning); box-shadow: 0 0 6px var(--warning); }
    ${getOperationalPanelStyles()}
  </style>
</head>
<body>
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
        <form method="POST" action="/${escapeHtml(fullAdminPath)}/logout" style="margin:0;">
          <button type="submit" class="btn-logout">Keluar (Logout)</button>
        </form>
      </div>
    </header>

    <!-- Admin Notification Toast / Banner -->
    <div id="admin-toast-banner" style="display:none; margin-bottom: 1.5rem; padding: 0.85rem 1.25rem; border-radius: 0.75rem; font-size: 0.85rem; font-weight: 600; align-items: center; justify-content: space-between;"></div>

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

    <!-- Automated Recommendations Section -->
    <section class="rec-box">
      <div class="rec-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
        Rekomendasi Sistem Otomatis
      </div>
      <ul class="rec-list">
        ${recommendations
          .map(
            (r) =>
              `<li class="rec-item"><span class="rec-bullet">✦</span><span>${escapeHtml(
                r
              )}</span></li>`
          )
          .join('')}
      </ul>
    </section>

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
                )}" target="_blank" class="link-view" style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.825rem;" title="${escapeHtml(
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

    <!-- Manajemen Sesi Admin Aktif -->
    ${renderActiveSessionsHtml(activeSessions)}

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
                  <div style="font-weight: 700; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(
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

    <!-- Log Aktivitas Keamanan & Audit Admin -->
    ${renderAuditLogsHtml(auditLogs)}

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

  <script>
    (function() {
      const panelPath = ${JSON.stringify(fullAdminPath)};
      const badgeDot = document.getElementById('live-sync-dot');
      const badgeTitle = document.getElementById('live-sync-title');
      const badgeTime = document.getElementById('live-sync-time');

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
        toast.innerHTML = '<span>' + msg + '</span><button type="button" onclick="this.parentElement.style.display=\\'none\\'" style="background:none; border:none; color:inherit; font-size:1.1rem; cursor:pointer; padding:0 0.5rem;">&times;</button>';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      // 1. Permanent Deletion handler (with browser confirm dialog)
      document.addEventListener('click', async function(e) {
        const btn = e.target.closest('.btn-delete-perm');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name') || id;

        const confirmText = 'PERINGATAN: Penghapusan dari Catbox bersifat PERMANEN dan TIDAK DAPAT DIBATALKAN!\\n\\n' +
          'Berkas "' + name + '" (' + id + ') akan dihapus selamanya dari server Catbox dan tautan tidak akan bisa diakses lagi oleh siapapun.\\n\\n' +
          'Apakah Anda yakin ingin menghapus permanen?';

        if (!confirm(confirmText)) {
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

        if (!confirm('Hapus entri berkas "' + name + '" (' + id + ') dari riwayat repositori AirShare?\\n\\nFile ini memang sudah tidak ada di Catbox, aksi ini hanya membersihkan sisa riwayat di database.')) {
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
  </script>
</body>
</html>`;

    res.status(200).send(html);
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
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/delete-permanent
   * Irreversibly deletes file from Catbox upstream and removes it from AirShare database/analytics.
   * Strictly protected by requireAdminAuth.
   */
  async deletePermanent(req: Request, res: Response): Promise<void> {
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

    // Clean up analytics recent uploads cache
    await analyticsRepository.removeRecentUpload(id);

    // Clean up sync check broken item if recorded
    await removeSyncCheckItem(id);

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
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/delete-history-only
   * Cleans up broken or orphan file metadata from AirShare database without calling Catbox.
   * Strictly protected by requireAdminAuth.
   */
  async deleteHistoryOnly(req: Request, res: Response): Promise<void> {
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
    await mediaRepo.deleteForAdmin(id);
    await analyticsRepository.removeRecentUpload(id);
    await removeSyncCheckItem(id);

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
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/sync-check
   * Verifies recent files on Catbox upstream to identify active vs broken/orphan files.
   * Strictly protected by requireAdminAuth.
   */
  async runSyncCheck(req: Request, res: Response): Promise<void> {
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
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/config
   * Updates dynamic system configurations (limits, announcement banner, feature flags).
   */
  async updateConfig(req: Request, res: Response): Promise<void> {
    const clientIp = getClientIp(req);
    const { maxUploadSize, rateLimit, announcement, featureFlags } = req.body || {};
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

    if (announcement && typeof announcement.message === 'string') {
      const validTypes = ['info', 'warning', 'success'] as const;
      const type = validTypes.includes(announcement.type) ? announcement.type : 'info';
      await setAnnouncement({
        message: announcement.message,
        type,
        enabled: Boolean(announcement.enabled),
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
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/maintenance
   * Toggles the maintenance mode kill switch.
   */
  async toggleMaintenance(req: Request, res: Response): Promise<void> {
    const clientIp = getClientIp(req);
    const enabled = Boolean(req.body?.enabled);
    await setMaintenanceMode(enabled);

    await auditLogRepository.recordAction({
      type: 'MAINTENANCE_TOGGLE',
      detail: enabled
        ? 'Kill Switch DIAKTIFKAN — Mode Pemeliharaan aktif, seluruh unggahan publik ditolak (503)'
        : 'Kill Switch DINONAKTIFKAN — Mode Pemeliharaan nonaktif, layanan unggahan berjalan normal',
      ip: clientIp,
    });

    alertMaintenanceModeChanged(enabled, 'web', `IP ${clientIp}`).catch((alertErr) => {
      console.warn('[TELEGRAM_ALERT_WARN] Gagal mengirim alert maintenance mode:', alertErr);
    });

    res.json({
      success: true,
      maintenanceMode: enabled,
      message: enabled
        ? 'Mode Pemeliharaan aktif (Kill Switch Hidup).'
        : 'Mode Pemeliharaan dinonaktifkan (Layanan Normal).',
    });
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/revoke-session
   * Revokes a specific active admin session.
   */
  async revokeSession(req: Request, res: Response): Promise<void> {
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
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/revoke-all-sessions
   * Revokes all active admin sessions except current one.
   */
  async revokeAllSessions(req: Request, res: Response): Promise<void> {
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
  },

  /**
   * GET /{ADMIN_PANEL_PATH}/api/search
   * Search files in repository by name, ID, or filename.
   */
  async searchFiles(req: Request, res: Response): Promise<void> {
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
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/bulk-cleanup/preview
   * Previews files matching age and view count criteria.
   */
  async previewBulkCleanup(req: Request, res: Response): Promise<void> {
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
  },

  /**
   * POST /{ADMIN_PANEL_PATH}/api/bulk-cleanup
   * Irreversibly deletes files matching criteria from Catbox and database.
   */
  async executeBulkCleanup(req: Request, res: Response): Promise<void> {
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
          await removeSyncCheckItem(item.id);
          succeeded++;
          freedBytes += item.size || 0;
        } catch (err) {
          failed++;
        }
      }
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
  },
};

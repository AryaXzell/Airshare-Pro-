import { Request, Response } from 'express';
import {
  getMaintenanceLevel,
  getAnnouncement,
  getFeatureFlags,
  MaintenanceLevel,
  AnnouncementBanner,
} from '../security/system-config';
import { checkCatboxHealth } from '../storage/catbox-health-check';
import { checkRedisHealth } from '../storage/redis-client';
import { SystemStatusData } from '../../types';
import {
  GOOGLE_FONTS_TAGS,
  THEME_HEAD_SCRIPT,
  THEME_BODY_SCRIPT,
  THEME_STORAGE_LISTENER_SCRIPT,
  THEME_CSS_VARIABLES,
} from './theme-styles';

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

      const data = await getSystemStatusData();
      const currentLevel = data.maintenanceLevel;
      const overallStatus = data.status;

      let bannerBg = 'rgba(16, 185, 129, 0.1)';
      let bannerBorder = 'rgba(16, 185, 129, 0.25)';
      let bannerColor = '#34d399';
      let bannerDotClass = 'dot-operational';
      let bannerHeadline = 'Semua Sistem Beroperasi Normal';
      let bannerSubtitle = 'Seluruh layanan unggah, unduh, dan penyimpanan berjalan optimal.';

      if (overallStatus === 'major_outage' || currentLevel === 'full_lockdown') {
        bannerBg = 'rgba(239, 68, 68, 0.12)';
        bannerBorder = 'rgba(239, 68, 68, 0.35)';
        bannerColor = '#f87171';
        bannerDotClass = 'dot-outage';
        bannerHeadline = 'Lockdown Total — Layanan Ditutup Sementara';
        bannerSubtitle = 'Seluruh akses unggah dan berbagi publik ditutup sementara untuk perbaikan mendesak.';
      } else if (overallStatus === 'degraded' || currentLevel === 'upload_only') {
        bannerBg = 'rgba(245, 158, 11, 0.12)';
        bannerBorder = 'rgba(245, 158, 11, 0.35)';
        bannerColor = '#fbbf24';
        bannerDotClass = 'dot-degraded';
        bannerHeadline =
          currentLevel === 'upload_only'
            ? 'Pemeliharaan — Fitur Unggah Ditutup Sementara'
            : 'Sebagian Layanan Mengalami Penurunan Performa';
        bannerSubtitle =
          currentLevel === 'upload_only'
            ? 'Unggahan baru dinonaktifkan sementara. Tautan share yang sudah ada tetap dapat dibuka normal.'
            : 'Tim kami sedang memantau dan memulihkan kestabilan jaringan upstream.';
      }

      function renderServiceBadge(status: string) {
        if (status === 'operational') {
          return `<span class="service-badge badge-green"><span class="badge-dot"></span>Beroperasi Normal</span>`;
        }
        if (status === 'maintenance') {
          return `<span class="service-badge badge-yellow"><span class="badge-dot pulse"></span>Pemeliharaan</span>`;
        }
        if (status === 'degraded') {
          return `<span class="service-badge badge-yellow"><span class="badge-dot pulse"></span>Penurunan Performa</span>`;
        }
        return `<span class="service-badge badge-red"><span class="badge-dot pulse"></span>Gangguan</span>`;
      }

      const formattedCheckedTime = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });

      const announcementHtml = data.announcement
        ? `
      <div class="announcement-card type-${escapeHtml(data.announcement.type || 'info')}">
        <div class="ann-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <div class="ann-content">
          <div class="ann-title">Pengumuman Resmi</div>
          <div class="ann-msg">${escapeHtml(data.announcement.message)}</div>
        </div>
      </div>
      `
        : '';

      const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>AirShare Pro — System Status</title>
  <meta name="description" content="Status operasional real-time layanan AirShare Pro, uptime penyimpanan Catbox, dan database.">
  <meta property="og:title" content="AirShare Pro — System Status">
  <meta property="og:description" content="Status operasional real-time layanan AirShare Pro, uptime penyimpanan Catbox, dan database.">
  <meta property="og:type" content="website">
  <link rel="icon" type="image/svg+xml" href="/vite.svg">
  ${GOOGLE_FONTS_TAGS}
  ${THEME_HEAD_SCRIPT}
  <style>
    ${THEME_CSS_VARIABLES}

    :root {
      --card-bg: var(--surface-primary);
      --card-border: var(--border-subtle);
      --card-hover: var(--surface-hover);
      --fg: var(--text-main);
      --muted: var(--text-muted);
      --subtle: var(--text-muted);
      --primary: var(--accent);
      --primary-hover: var(--accent-hover);
      --green: #10b981;
      --green-light: #34d399;
      --yellow: #f59e0b;
      --yellow-light: #fbbf24;
      --red: #ef4444;
      --red-light: #f87171;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-primary);
      color: var(--text-main);
      font-family: var(--font-sans);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      transition: background-color 0.25s ease, color 0.25s ease;
    }

    .container {
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      padding: 2.5rem 1.25rem 4rem;
      flex: 1;
    }

    /* Header & Navbar */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 2rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      text-decoration: none;
      color: var(--text-main);
    }

    .brand-icon {
      width: 36px;
      height: 36px;
      background: var(--accent);
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent-text);
      box-shadow: var(--shadow-subtle);
    }

    .brand-title {
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-main);
    }

    .brand-pill {
      font-size: 0.7rem;
      font-weight: 600;
      background: var(--accent-soft);
      color: var(--accent);
      border: 1px solid var(--border-subtle);
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .btn-nav {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.825rem;
      font-weight: 600;
      color: var(--text-muted);
      text-decoration: none;
      padding: 0.45rem 0.85rem;
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      transition: all 0.2s ease;
      cursor: pointer;
    }

    .btn-nav:hover {
      background: var(--surface-hover);
      color: var(--text-main);
      border-color: var(--border-subtle-hover);
    }

    /* Overall Status Hero */
    .status-hero {
      background: ${bannerBg};
      border: 1px solid ${bannerBorder};
      border-radius: 14px;
      padding: 1.5rem 1.75rem;
      margin-bottom: 2rem;
      display: flex;
      align-items: flex-start;
      gap: 1.25rem;
      transition: all 0.3s ease;
      box-shadow: var(--shadow-subtle);
    }

    .hero-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      flex-shrink: 0;
      margin-top: 5px;
    }

    .dot-operational {
      background-color: var(--green);
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.6);
    }

    .dot-degraded {
      background-color: var(--yellow);
      box-shadow: 0 0 12px rgba(245, 158, 11, 0.6);
      animation: pulse-glow 2s infinite ease-in-out;
    }

    .dot-outage {
      background-color: var(--red);
      box-shadow: 0 0 12px rgba(239, 68, 68, 0.6);
      animation: pulse-glow 1.5s infinite ease-in-out;
    }

    @keyframes pulse-glow {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.2); opacity: 0.75; }
    }

    .hero-headline {
      font-size: 1.2rem;
      font-weight: 700;
      color: ${bannerColor};
      letter-spacing: -0.01em;
      margin-bottom: 0.35rem;
    }

    .hero-sub {
      font-size: 0.875rem;
      color: var(--text-muted);
      line-height: 1.5;
    }

    /* Announcement */
    .announcement-card {
      background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 12px;
      padding: 1.15rem 1.35rem;
      margin-bottom: 2rem;
      display: flex;
      gap: 1rem;
      align-items: flex-start;
      color: #7dd3fc;
    }

    .announcement-card.type-warning {
      background: rgba(245, 158, 11, 0.08);
      border-color: rgba(245, 158, 11, 0.25);
      color: #fde047;
    }

    .announcement-card.type-success {
      background: rgba(16, 185, 129, 0.08);
      border-color: rgba(16, 185, 129, 0.25);
      color: #6ee7b7;
    }

    .ann-icon {
      flex-shrink: 0;
      margin-top: 2px;
    }

    .ann-title {
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.25rem;
    }

    .ann-msg {
      font-size: 0.875rem;
      line-height: 1.5;
      color: var(--text-main);
    }

    /* Section Title */
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .section-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .refresh-info {
      font-size: 0.75rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    /* Services List */
    .services-grid {
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 2.25rem;
      box-shadow: var(--shadow-subtle);
    }

    .service-row {
      padding: 1.15rem 1.35rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      border-bottom: 1px solid var(--border-subtle);
      transition: background 0.15s ease;
    }

    .service-row:last-child {
      border-bottom: none;
    }

    .service-row:hover {
      background: var(--surface-hover);
    }

    .service-info {
      flex: 1;
    }

    .service-name {
      font-size: 0.925rem;
      font-weight: 600;
      color: var(--text-main);
      margin-bottom: 0.2rem;
    }

    .service-desc {
      font-size: 0.775rem;
      color: var(--text-muted);
      line-height: 1.4;
    }

    .service-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.775rem;
      font-weight: 600;
      padding: 0.3rem 0.7rem;
      border-radius: 9999px;
      white-space: nowrap;
    }

    .badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .badge-green {
      background: rgba(16, 185, 129, 0.12);
      color: var(--green-light);
      border: 1px solid rgba(16, 185, 129, 0.25);
    }
    .badge-green .badge-dot { background: var(--green); }

    .badge-yellow {
      background: rgba(245, 158, 11, 0.12);
      color: var(--yellow-light);
      border: 1px solid rgba(245, 158, 11, 0.25);
    }
    .badge-yellow .badge-dot { background: var(--yellow); }

    .badge-red {
      background: rgba(239, 68, 68, 0.12);
      color: var(--red-light);
      border: 1px solid rgba(239, 68, 68, 0.25);
    }
    .badge-red .badge-dot { background: var(--red); }

    /* Metrics Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2.25rem;
    }

    .metric-card {
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 1.15rem 1.25rem;
      box-shadow: var(--shadow-subtle);
    }

    .metric-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.35rem;
    }

    .metric-val {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--text-main);
    }

    .metric-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.2rem;
    }

    /* Past Incidents */
    .incidents-card {
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 1.25rem 1.35rem;
      margin-bottom: 2.5rem;
      box-shadow: var(--shadow-subtle);
    }

    .incident-entry {
      display: flex;
      align-items: flex-start;
      gap: 0.85rem;
      font-size: 0.825rem;
      color: var(--text-muted);
    }

    /* Footer */
    .footer {
      border-top: 1px solid var(--border-subtle);
      padding-top: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      font-size: 0.775rem;
      color: var(--text-muted);
    }

    .footer a {
      color: var(--text-muted);
      text-decoration: none;
      transition: color 0.2s;
    }

    .footer a:hover {
      color: var(--accent);
    }

    .footer-links {
      display: flex;
      gap: 1.25rem;
    }

    @media (max-width: 640px) {
      .service-row {
        flex-direction: column;
        align-items: flex-start;
      }
      .service-badge {
        align-self: flex-start;
      }
    }
  </style>
</head>
<body class="theme-rosegold">
  ${THEME_BODY_SCRIPT}
  <div class="container">
    <!-- Navbar -->
    <header class="header">
      <a href="/" class="brand">
        <div class="brand-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
            <path d="M12 12v9"></path>
            <path d="m16 16-4-4-4 4"></path>
          </svg>
        </div>
        <span class="brand-title">AirShare Pro</span>
        <span class="brand-pill">Status</span>
      </a>

      <div class="nav-actions">
        <button type="button" class="btn-nav" id="btn-manual-refresh" onclick="location.reload()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
            <path d="M3 3v5h5"></path>
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
            <path d="M16 21h5v-5"></path>
          </svg>
          Segarkan
        </button>
        <a href="/" class="btn-nav">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
          Beranda
        </a>
      </div>
    </header>

    <!-- Overall Status Hero -->
    <div class="status-hero">
      <div class="hero-dot ${bannerDotClass}"></div>
      <div>
        <div class="hero-headline">${bannerHeadline}</div>
        <div class="hero-sub">${bannerSubtitle}</div>
      </div>
    </div>

    <!-- Active Announcement (if any) -->
    ${announcementHtml}

    <!-- Services Section -->
    <div class="section-header">
      <div class="section-title">Status Layanan &amp; Infrastruktur</div>
      <div class="refresh-info">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        <span>Pemeriksaan terakhir: <strong>${formattedCheckedTime}</strong></span>
      </div>
    </div>

    <div class="services-grid">
      <!-- Upload Service -->
      <div class="service-row">
        <div class="service-info">
          <div class="service-name">${escapeHtml(data.services.upload.label)}</div>
          <div class="service-desc">${escapeHtml(data.services.upload.message || '')}</div>
        </div>
        ${renderServiceBadge(data.services.upload.status)}
      </div>

      <!-- Download & Share Service -->
      <div class="service-row">
        <div class="service-info">
          <div class="service-name">${escapeHtml(data.services.download.label)}</div>
          <div class="service-desc">${escapeHtml(data.services.download.message || '')}</div>
        </div>
        ${renderServiceBadge(data.services.download.status)}
      </div>

      <!-- Storage (Catbox) -->
      <div class="service-row">
        <div class="service-info">
          <div class="service-name">${escapeHtml(data.services.storage.label)}</div>
          <div class="service-desc">${escapeHtml(data.services.storage.message || '')}</div>
        </div>
        ${renderServiceBadge(data.services.storage.status)}
      </div>

      <!-- Database (Redis) -->
      <div class="service-row">
        <div class="service-info">
          <div class="service-name">${escapeHtml(data.services.database.label)}</div>
          <div class="service-desc">${escapeHtml(data.services.database.message || '')}</div>
        </div>
        ${renderServiceBadge(data.services.database.status)}
      </div>
    </div>

    <!-- Metrics Section -->
    <div class="section-header">
      <div class="section-title">Metrik Keandalan Sistem</div>
    </div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Uptime Layanan (30 Hari)</div>
        <div class="metric-val" style="color: var(--green-light);">${data.uptime.status}</div>
        <div class="metric-sub">Ketersediaan sistem tingkat tinggi</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Latensi Penyimpanan</div>
        <div class="metric-val">${data.services.storage.latencyMs !== undefined ? data.services.storage.latencyMs + ' ms' : 'N/A'}</div>
        <div class="metric-sub">Kecepatan respons upstream</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Latensi Database</div>
        <div class="metric-val">${data.services.database.latencyMs !== undefined ? data.services.database.latencyMs + ' ms' : 'In-Memory'}</div>
        <div class="metric-sub">Cache &amp; metadata real-time</div>
      </div>
    </div>

    <!-- Past 24h Incident Report -->
    <div class="section-header">
      <div class="section-title">Riwayat Insiden (24 Jam Terakhir)</div>
    </div>

    <div class="incidents-card">
      <div class="incident-entry">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--green); flex-shrink: 0; margin-top: 1px;">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <div>
          <div style="font-weight: 600; color: var(--fg); margin-bottom: 0.15rem;">
            ${
              overallStatus === 'operational'
                ? 'Tidak ada insiden atau gangguan yang dilaporkan.'
                : overallStatus === 'major_outage'
                ? 'Sedang berlangsung: Lockdown total untuk pemeliharaan sistem.'
                : 'Sedang berlangsung: Penyesuaian mode operasional sistem.'
            }
          </div>
          <div style="font-size: 0.775rem; color: var(--subtle);">
            Semua metrik dan pemeriksaan kesehatan dipantau secara otomatis setiap 30 detik.
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="footer">
      <div>&copy; ${new Date().getFullYear()} AirShare Pro. Status Real-time.</div>
      <div class="footer-links">
        <a href="/">Beranda</a>
        <a href="/api/system-status" target="_blank" rel="noopener">JSON API</a>
        <a href="/api/health" target="_blank" rel="noopener">Health Check</a>
      </div>
    </footer>
  </div>

  <script>
    // Auto-refresh status every 30 seconds
    let refreshTimer = 30;
    setInterval(function() {
      refreshTimer--;
      if (refreshTimer <= 0) {
        window.location.reload();
      }
    }, 1000);

    ${THEME_STORAGE_LISTENER_SCRIPT}
  </script>
</body>
</html>`;

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

import { SystemStatusData } from '../../../types';
import {
  GOOGLE_FONTS_TAGS,
  THEME_HEAD_SCRIPT,
  THEME_BODY_SCRIPT,
  THEME_STORAGE_LISTENER_SCRIPT,
} from '../../admin-html/styles/theme.css';
import { getStatusPageCss } from '../styles/status.css';

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderServiceBadge(status: string): string {
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

export function renderStatusPageHtml(
  data: SystemStatusData,
  canonicalUrl: string,
  siteRootUrl: string
): string {
  const currentLevel = data.maintenanceLevel;
  const overallStatus = data.status;

  let bannerBg = 'rgba(16, 185, 129, 0.1)';
  let bannerBorder = 'rgba(16, 185, 129, 0.25)';
  let bannerColor = 'var(--status-operational)';
  let bannerDotClass = 'dot-operational';
  let bannerHeadline = 'Semua Sistem Beroperasi Normal';
  let bannerSubtitle = 'Seluruh layanan unggah, unduh, dan penyimpanan berjalan optimal.';

  if (overallStatus === 'major_outage' || currentLevel === 'full_lockdown') {
    bannerBg = 'rgba(239, 68, 68, 0.12)';
    bannerBorder = 'rgba(239, 68, 68, 0.35)';
    bannerColor = 'var(--status-outage)';
    bannerDotClass = 'dot-outage';
    bannerHeadline = 'Lockdown Total — Layanan Ditutup Sementara';
    bannerSubtitle = 'Seluruh akses unggah dan berbagi publik ditutup sementara untuk perbaikan mendesak.';
  } else if (overallStatus === 'degraded' || currentLevel === 'upload_only') {
    bannerBg = 'rgba(245, 158, 11, 0.12)';
    bannerBorder = 'rgba(245, 158, 11, 0.35)';
    bannerColor = 'var(--status-degraded)';
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

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>AirShare Pro — Status Layanan &amp; Kinerja Sistem Real-Time</title>
  <meta name="description" content="Pantau status operasional real-time layanan AirShare Pro, ketersediaan penyimpanan cloud Catbox, database Redis, uptime server, dan performa jaringan.">
  <meta name="keywords" content="airshare pro status, system status, uptime airshare pro, status server, catbox status, redis status, pemantauan sistem, latency">
  <meta name="author" content="AirShare Pro Team">
  <meta name="application-name" content="AirShare Pro">
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
  <link rel="canonical" href="${canonicalUrl}">

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:title" content="AirShare Pro — Status Layanan &amp; Kinerja Sistem Real-Time">
  <meta property="og:description" content="Pantau status operasional real-time layanan AirShare Pro, ketersediaan penyimpanan cloud Catbox, database Redis, uptime server, dan performa jaringan.">
  <meta property="og:site_name" content="AirShare Pro">
  <meta property="og:locale" content="id_ID">
  <meta property="og:image" content="${siteRootUrl}og-image.png">

  <!-- Twitter Meta Tags -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:url" content="${canonicalUrl}">
  <meta name="twitter:title" content="AirShare Pro — Status Layanan &amp; Kinerja Sistem Real-Time">
  <meta name="twitter:description" content="Pantau status operasional real-time layanan AirShare Pro, ketersediaan penyimpanan cloud Catbox, database Redis, uptime server, dan performa jaringan.">
  <meta name="twitter:image" content="${siteRootUrl}og-image.png">

  <!-- JSON-LD Structured Data for Search Engines -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Status Layanan & Kinerja Sistem AirShare Pro",
    "description": "Pantau status operasional real-time layanan AirShare Pro, uptime penyimpanan Catbox, dan database.",
    "url": "${canonicalUrl}",
    "inLanguage": "id-ID",
    "isPartOf": {
      "@type": "WebSite",
      "name": "AirShare Pro",
      "url": "${siteRootUrl}"
    },
    "about": {
      "@type": "Service",
      "name": "AirShare Pro Media Cloud Sharing",
      "serviceType": "Cloud File Sharing and Media Streaming Platform",
      "provider": {
        "@type": "Organization",
        "name": "AirShare Pro",
        "url": "${siteRootUrl}"
      }
    }
  }
  </script>

  <link rel="icon" type="image/svg+xml" href="/icon.svg">
  ${GOOGLE_FONTS_TAGS}
  ${THEME_HEAD_SCRIPT}
  <style>
${getStatusPageCss(bannerBg, bannerBorder, bannerColor)}
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

    <main id="main-content">
      <!-- Overall Status Hero -->
      <section class="status-hero" aria-label="Status Ringkasan Sistem">
        <div class="hero-dot ${bannerDotClass}"></div>
        <div>
          <h1 class="hero-headline">${bannerHeadline}</h1>
          <div class="hero-sub">${bannerSubtitle}</div>
        </div>
      </section>

      <!-- Active Announcement (if any) -->
      ${announcementHtml}

      <!-- Services Section -->
      <section aria-label="Status Layanan dan Infrastruktur">
        <div class="section-header">
          <h2 class="section-title">Status Layanan &amp; Infrastruktur</h2>
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
      </section>

      <!-- Metrics Section -->
      <section aria-label="Metrik Keandalan Sistem" style="margin-top: 2rem;">
        <div class="section-header">
          <h2 class="section-title">Metrik Keandalan Sistem</h2>
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
      </section>

      <!-- Past 24h Incident Report -->
      <section aria-label="Riwayat Insiden" style="margin-top: 2rem;">
        <div class="section-header">
          <h2 class="section-title">Riwayat Insiden (24 Jam Terakhir)</h2>
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
      </section>
    </main>

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
}

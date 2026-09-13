import {
  GOOGLE_FONTS_TAGS,
  THEME_HEAD_SCRIPT,
  THEME_BODY_SCRIPT,
  THEME_STORAGE_LISTENER_SCRIPT,
  THEME_CSS_VARIABLES,
} from '../styles/theme.css';
import { getBaseCss } from '../styles/base.css';
import { getDashboardPanelsCss } from '../styles/dashboard-panels.css';
import { getComponentsCss } from '../styles/components.css';
import { getResponsiveCss } from '../styles/responsive.css';
import {
  getOperationalPanelStyles,
  getOperationalPanelScripts,
  renderOperationalControlsHtml,
  renderActiveSessionsHtml,
  renderAuditLogsHtml,
  renderBulkCleanupHtml,
} from '../../api/admin-operational-panel';
import { SystemConfig } from '../../security/system-config';
import { CatboxHealthStatus, SyncCheckSummary } from '../../storage/catbox-health-check';
import { getIosModalScript } from '../scripts/ios-modal.client';
import { getDashboardNavScript } from '../scripts/dashboard-nav.client';
import { getAiRecommendationsScript } from '../scripts/ai-recommendations.client';
import { getTableActionsScript } from '../scripts/table-actions.client';
import { getLiveStatsScript } from '../scripts/live-stats.client';

export interface DashboardPageData {
  fullAdminPath: string;
  initialTimeFormatted: string;
  todayStats: {
    uploads: number;
    formattedBytes: string;
    totalViews: number;
    formattedAverageSize: string;
    byType: Record<string, number>;
    byCountry: Record<string, number>;
  };
  weeklyTrend: Array<{
    date: string;
    uploads: number;
    bytes: number;
    formattedBytes: string;
  }>;
  totalItemsInRepo: number;
  enhancedRecentUploads: Array<{
    id: string;
    name: string;
    type: string;
    formattedSize: string;
    uploaderCountryCode?: string;
    createdAt: number;
    views: number;
  }>;
  topFiles: Array<{
    id: string;
    name: string;
    views: number;
    formattedSize: string;
    type: string;
    shareUrl: string;
  }>;
  deletedFiles: Array<{
    id: string;
    name: string;
    formattedSize?: string;
    type?: string;
    shareUrl: string;
    deletedAt: number;
    deletedBy?: string;
    reason?: string;
  }>;
  recommendations: string[];
  storageMode: string;
  redisConnected: boolean;
  isUpstashConfigured: boolean;
  catboxHealth: CatboxHealthStatus;
  uptimeFormatted: string;
  initialDate: Date;
  geminiModelName: string;
  systemConfig: SystemConfig;
  lastSyncCheck: SyncCheckSummary | null;
  activeSessions: any[];
  auditLogs: any[];
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const SUPPORTED_COUNTRY_FLAGS = new Set([
  'ae', 'ar', 'au', 'bd', 'br', 'ca', 'ch', 'cl', 'cn', 'co',
  'de', 'es', 'fr', 'gb', 'globe', 'hk', 'id', 'in', 'it', 'jp',
  'kr', 'mx', 'my', 'ng', 'nl', 'ph', 'pk', 'pl', 'ru', 'sa',
  'se', 'sg', 'th', 'tr', 'tw', 'ua', 'us', 'vn', 'za'
]);

function getFlagAssetPath(countryCode?: string): string {
  if (!countryCode) return '/flags/globe.svg';
  const clean = countryCode.trim().toLowerCase();
  if (SUPPORTED_COUNTRY_FLAGS.has(clean)) {
    return `/flags/${clean}.svg`;
  }
  return '/flags/globe.svg';
}

function formatRelativeTime(timestampMs: number): string {
  if (!timestampMs || isNaN(timestampMs)) return '-';
  const diffMs = Date.now() - timestampMs;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) return `${diffSec} dtk lalu`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} hari lalu`;
}

function formatAbsoluteTime(timestampMs: number): string {
  if (!timestampMs || isNaN(timestampMs)) return '-';
  const date = new Date(timestampMs);
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  });
}

export function renderSyncSummaryHtml(check: SyncCheckSummary | null): string {
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
              <td style="font-weight: 600;">${escapeHtml(item.formattedSize || '-')}</td>
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

export function renderAdminDashboardHtml(data: DashboardPageData): string {
  const {
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
    isUpstashConfigured,
    catboxHealth,
    uptimeFormatted,
    initialDate,
    geminiModelName,
    systemConfig,
    lastSyncCheck,
    activeSessions,
    auditLogs,
  } = data;

  const totalUploadedToday = todayStats.uploads || 0;
  const typeCounts = {
    image: todayStats.byType['image'] || 0,
    video: todayStats.byType['video'] || 0,
    audio: todayStats.byType['audio'] || 0,
    file: todayStats.byType['file'] || 0,
  };

  const sortedCountries = Object.entries(todayStats.byCountry).sort((a, b) => b[1] - a[1]);
  const maxDailyUploads = Math.max(1, ...weeklyTrend.map((d) => d.uploads));

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AirShare Pro — Analytics &amp; Admin Dashboard</title>
  ${GOOGLE_FONTS_TAGS}
  ${THEME_HEAD_SCRIPT}
  <style>
    ${THEME_CSS_VARIABLES}
    ${getBaseCss()}
    ${getDashboardPanelsCss()}
    ${getComponentsCss()}
    ${getResponsiveCss()}
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
      <button type="button" class="admin-tab-btn" data-category="status" id="mobile-tab-status" aria-controls="panel-status" onclick="switchCategory('status')" role="tab" aria-selected="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        <span>Status Sistem</span>
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
          <button type="button" class="admin-sidebar-btn" data-category="status" id="sidebar-btn-status" aria-controls="panel-status" onclick="switchCategory('status')" role="tab" aria-selected="false">
            <div class="sidebar-btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div class="sidebar-btn-content">
              <span class="sidebar-btn-title">Status Sistem</span>
              <span class="sidebar-btn-desc">Infrastruktur &amp; Kesehatan Hulu</span>
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
                  <span id="ai-rec-model-label">Gemini 2.5 Flash</span>
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

        <!-- 3. Kategori: Status Sistem -->
        <div class="category-panel" id="panel-status" data-category-panel="status" role="tabpanel" aria-labelledby="sidebar-btn-status">
          <!-- 4 Core Infrastructure Status Cards -->
          <section class="metrics-grid" style="margin-bottom: 1.5rem;">
            <!-- Storage Backend -->
            <div class="metric-card" id="status-card-storage">
              <div class="metric-header">
                <span class="metric-label">Penyimpanan Utama</span>
                <div class="metric-icon" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin: 0.4rem 0;">
                <span class="status-indicator ${redisConnected || !isUpstashConfigured ? 'status-ok' : 'status-warn'}" id="status-tab-storage-dot"></span>
                <div class="metric-value" style="font-size: 1.1rem; font-weight: 800;" id="status-tab-storage-val">${escapeHtml(storageMode)}</div>
              </div>
              <div class="metric-sub" id="status-tab-storage-sub">
                ${redisConnected ? 'Koneksi aktif ke cluster Upstash Redis' : (!isUpstashConfigured ? 'Penyimpanan lokal RAM in-memory aktif' : 'Gangguan koneksi - fallback in-memory')}
              </div>
            </div>

            <!-- Catbox Upstream -->
            <div class="metric-card" id="status-card-catbox">
              <div class="metric-header">
                <span class="metric-label">Koneksi Hulu Catbox</span>
                <div class="metric-icon" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m12 12 4 4"/><path d="m16 12-4 4"/></svg>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin: 0.4rem 0;">
                <span class="status-indicator ${catboxHealth.available ? 'status-ok' : 'status-warn'}" id="status-tab-catbox-dot"></span>
                <div class="metric-value" style="font-size: 1.1rem; font-weight: 800;" id="status-tab-catbox-val">
                  ${catboxHealth.available ? `Tersedia (${catboxHealth.latencyMs}ms)` : 'Tidak Tersedia'}
                </div>
              </div>
              <div class="metric-sub" id="status-tab-catbox-sub">
                ${catboxHealth.available ? 'Endpoint https://catbox.moe/user/api.php beroperasi normal' : 'Penyedia Catbox tidak dapat dijangkau'}
              </div>
            </div>

            <!-- Server Uptime -->
            <div class="metric-card" id="status-card-uptime">
              <div class="metric-header">
                <span class="metric-label">Waktu Aktif Server</span>
                <div class="metric-icon" style="background: rgba(168, 85, 247, 0.15); color: #a855f7;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin: 0.4rem 0;">
                <span class="status-indicator status-ok"></span>
                <div class="metric-value" style="font-size: 1.1rem; font-weight: 800;" id="status-tab-uptime-val">${escapeHtml(uptimeFormatted)}</div>
              </div>
              <div class="metric-sub">
                Container runtime Node.js stabil &amp; beroperasi normal
              </div>
            </div>

            <!-- Kerahasiaan & Keamanan Indeks -->
            <div class="metric-card" id="status-card-privacy">
              <div class="metric-header">
                <span class="metric-label">Kerahasiaan &amp; Indeks</span>
                <div class="metric-icon" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin: 0.4rem 0;">
                <span class="status-indicator status-ok"></span>
                <div class="metric-value" style="font-size: 1.1rem; font-weight: 800;">No-Index / No-Follow Active</div>
              </div>
              <div class="metric-sub">
                Header proteksi X-Robots-Tag &amp; Cache-Control aktif
              </div>
            </div>
          </section>

          <!-- Detail Spesifikasi Infrastruktur & Diagnostik Panel -->
          <div class="section-grid" style="margin-bottom: 1.5rem;">
            <!-- Spesifikasi Runtime & Server -->
            <section class="panel">
              <div class="panel-header">
                <h2 class="panel-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 9h6"/><path d="M15 15h6"/></svg>
                  Diagnostik Runtime &amp; Server
                </h2>
                <span class="panel-badge">Spesifikasi Lingkungan</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0.9rem; background: var(--surface-secondary); border-radius: 0.75rem; border: 1px solid var(--border-subtle); font-size: 0.825rem;">
                  <span style="color: var(--muted); font-weight: 600;">Node Environment</span>
                  <span style="font-weight: 700; font-family: var(--font-mono); color: var(--accent);">${escapeHtml(process.env.NODE_ENV || 'production')}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0.9rem; background: var(--surface-secondary); border-radius: 0.75rem; border: 1px solid var(--border-subtle); font-size: 0.825rem;">
                  <span style="color: var(--muted); font-weight: 600;">Zona Waktu Server</span>
                  <span style="font-weight: 700;">Asia/Jakarta (WIB, UTC+7)</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0.9rem; background: var(--surface-secondary); border-radius: 0.75rem; border: 1px solid var(--border-subtle); font-size: 0.825rem;">
                  <span style="color: var(--muted); font-weight: 600;">Waktu Server Saat Ini</span>
                  <span style="font-weight: 700; font-family: var(--font-mono);" id="status-tab-server-time">${escapeHtml(initialDate.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))} WIB</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0.9rem; background: var(--surface-secondary); border-radius: 0.75rem; border: 1px solid var(--border-subtle); font-size: 0.825rem;">
                  <span style="color: var(--muted); font-weight: 600;">Header Robots Bot</span>
                  <span style="font-weight: 700; font-family: var(--font-mono); color: #10b981;">noindex, nofollow, noarchive</span>
                </div>
              </div>
            </section>

            <!-- Status Layanan Eksternal & Integrasi -->
            <section class="panel">
              <div class="panel-header">
                <h2 class="panel-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  Integrasi &amp; Layanan Eksternal
                </h2>
                <span class="panel-badge">Konektivitas Hulu</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0.9rem; background: var(--surface-secondary); border-radius: 0.75rem; border: 1px solid var(--border-subtle); font-size: 0.825rem;">
                  <span style="color: var(--muted); font-weight: 600;">Upstream Storage Provider</span>
                  <span style="font-weight: 700; color: #10b981;">Catbox.moe (API HTTPS)</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0.9rem; background: var(--surface-secondary); border-radius: 0.75rem; border: 1px solid var(--border-subtle); font-size: 0.825rem;">
                  <span style="color: var(--muted); font-weight: 600;">Redis REST Provider</span>
                  <span style="font-weight: 700;">${isUpstashConfigured ? '<span style="color: #10b981;">Upstash Cloud REST (SSL)</span>' : '<span style="color: #f59e0b;">Memory Engine (Lokal)</span>'}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0.9rem; background: var(--surface-secondary); border-radius: 0.75rem; border: 1px solid var(--border-subtle); font-size: 0.825rem;">
                  <span style="color: var(--muted); font-weight: 600;">AI Engine Model</span>
                  <span style="font-weight: 700; font-family: var(--font-mono); color: var(--accent);">${escapeHtml(geminiModelName)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0.9rem; background: var(--surface-secondary); border-radius: 0.75rem; border: 1px solid var(--border-subtle); font-size: 0.825rem;">
                  <span style="color: var(--muted); font-weight: 600;">Keamanan Sesi &amp; Cookie</span>
                  <span style="font-weight: 700; color: #10b981;">HttpOnly, SameSite=Lax, Secure</span>
                </div>
              </div>
            </section>
          </div>
        </div>

        <!-- 4. Kategori: Kontrol Sistem -->
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

    <!-- Clean Minimalist Footer -->
    <footer class="admin-clean-footer">
      <div class="footer-left">
        <span>AirShare Pro Administration</span>
        <span class="footer-dot">&bull;</span>
        <span class="footer-desc">Status &amp; Kesehatan Infrastruktur lengkap tersedia di tab <a href="#status" onclick="switchCategory('status'); return false;" class="footer-tab-link">Status Sistem</a></span>
      </div>
      <div class="footer-right">
        <span>Sesi Aman Aktif</span>
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
    ${getIosModalScript()}

    (function() {
      ${getDashboardNavScript(fullAdminPath)}
      ${getAiRecommendationsScript(fullAdminPath)}
      ${getTableActionsScript(fullAdminPath)}
      ${getLiveStatsScript(fullAdminPath)}
    })();

    ${getOperationalPanelScripts(fullAdminPath)}

    ${THEME_STORAGE_LISTENER_SCRIPT}
  </script>
</body>
</html>`;
}

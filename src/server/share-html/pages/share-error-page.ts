import { getFullLockdownCss, getShareErrorCss } from '../styles/share-error.css';
import { getShareErrorScripts } from '../scripts/share-players.client';

export interface ThemedErrorOptions {
  title: string;
  heading: string;
  message: string;
  errorCode: string;
  httpStatus: number;
  itemId?: string;
  deletedAt?: number;
  reason?: string;
  upstreamUrl?: string;
  upstreamStatus?: string;
  requestId?: string;
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

function formatExactDate(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return 'Baru saja';
  const d = new Date(timestamp);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return 'Baru saja';
  const diffMs = Date.now() - timestamp;
  const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSecs < 60) return 'Baru saja';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins} menit lalu`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} hari lalu`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} bulan lalu`;
}

export function renderFullLockdownHtml(): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Layanan Sedang Ditutup Sementara — AirShare Pro</title>
  <style>
${getFullLockdownCss()}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="brand">
      <div class="brand-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      </div>
      <span class="brand-title">AirShare Pro</span>
      <span class="brand-tag">Maintenance</span>
    </div>

    <div class="card">
      <div class="status-badge-row">
        <div class="status-badge">
          <span class="status-dot"></span>
          <span>503 SERVICE UNAVAILABLE</span>
        </div>
      </div>

      <div class="hero-icon-container">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      </div>

      <h1>Layanan Sedang Ditutup Sementara</h1>
      <p class="desc">Saat ini seluruh akses layanan berbagi berkas sedang ditutup sementara untuk pemeliharaan sistem.</p>

      <div class="status-info-box">
        Silakan coba beberapa saat lagi. Anda dapat memantau perkembangan pemeliharaan melalui halaman status publik kami.
      </div>

      <div class="actions">
        <a href="/status" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
          </svg>
          Cek status layanan di sini
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function renderThemedErrorHtml(options: ThemedErrorOptions): string {
  const {
    title,
    heading,
    message,
    errorCode,
    httpStatus,
    itemId,
    deletedAt,
    reason,
    upstreamUrl,
    upstreamStatus,
    requestId,
  } = options;

  const isDeleted = httpStatus === 410 || errorCode.includes('DELETED') || errorCode.includes('PURGED');
  const isNotFound = httpStatus === 404;

  const statusBadgeLabel = isDeleted ? '410 GONE' : isNotFound ? '404 NOT FOUND' : `${httpStatus} ERROR`;
  const accentColor = isDeleted ? '#ef4444' : isNotFound ? '#f59e0b' : '#6366f1';
  const accentGlow = isDeleted
    ? 'rgba(239, 68, 68, 0.15)'
    : isNotFound
    ? 'rgba(245, 158, 11, 0.15)'
    : 'rgba(99, 102, 241, 0.15)';

  const heroIcon = isDeleted
    ? `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>`
    : isNotFound
    ? `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="9" y1="15" x2="15" y2="15"></line>
      </svg>`
    : `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>`;

  const exactDeletedTime = deletedAt ? formatExactDate(deletedAt) : null;
  const relativeDeletedTime = deletedAt ? formatRelativeTime(deletedAt) : null;
  const safeRequestId = requestId || `req_${Date.now().toString(36)}`;

  // Prepare JSON payload for the copy diagnostic log button
  const diagnosticPayload = {
    service: 'AirShare Pro Edge Network',
    timestamp: new Date().toISOString(),
    httpStatus,
    errorCode,
    message,
    itemId: itemId || null,
    deletedAt: exactDeletedTime ? `${exactDeletedTime} (${relativeDeletedTime})` : null,
    reason: reason || (isDeleted ? 'User or system permanent removal' : 'Resource missing'),
    upstreamStatus: upstreamStatus || 'Checked / Synchronized',
    upstreamUrl: upstreamUrl || null,
    requestId: safeRequestId,
  };
  const jsonString = JSON.stringify(diagnosticPayload, null, 2);

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(title)}</title>
  <style>
${getShareErrorCss(accentColor, accentGlow)}
  </style>
</head>
<body>
  <div class="wrapper">
    <a href="/" class="brand" title="Beranda AirShare Pro">
      <div class="brand-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
          <path d="m16 16-4-4-4 4"></path>
          <path d="M12 12v9"></path>
        </svg>
      </div>
      <span class="brand-title">AirShare Pro</span>
      <span class="brand-tag">Mesh Sync</span>
    </a>

    <div class="card">
      <div class="status-badge-row">
        <div class="status-badge">
          <span class="status-dot"></span>
          <span>${statusBadgeLabel}</span>
        </div>
        <span class="req-id">${escapeHtml(safeRequestId)}</span>
      </div>

      <div class="hero-icon-container">
        ${heroIcon}
      </div>

      <h1>${escapeHtml(heading)}</h1>
      <p class="desc">${escapeHtml(message)}</p>

      <div class="diagnostic-box">
        <div class="diagnostic-header">
          <div class="diagnostic-dots">
            <span class="dot dot-red"></span>
            <span class="dot dot-yellow"></span>
            <span class="dot dot-green"></span>
          </div>
          <span class="diagnostic-title">Audit Log Diagnostik</span>
          <button type="button" class="btn-copy" id="btnCopyLog" onclick="copyDiagnosticLog()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span id="copyBtnText">Salin Log</span>
          </button>
        </div>
        <div class="diagnostic-body">
          <div class="diag-row">
            <span class="diag-label">STATUS_CODE:</span>
            <span class="diag-value ${isDeleted ? 'highlight-red' : 'highlight-amber'}">${httpStatus} (${isDeleted ? 'Gone' : isNotFound ? 'Not Found' : 'Error'})</span>
          </div>
          <div class="diag-row">
            <span class="diag-label">ERROR_CODE:</span>
            <span class="diag-value highlight-blue">${escapeHtml(errorCode)}</span>
          </div>
          ${itemId ? `
          <div class="diag-row">
            <span class="diag-label">TARGET_ID:</span>
            <span class="diag-value">${escapeHtml(itemId)}</span>
          </div>
          ` : ''}
          ${exactDeletedTime ? `
          <div class="diag-row">
            <span class="diag-label">WAKTU_HAPUS:</span>
            <span class="diag-value">${escapeHtml(exactDeletedTime)} (${escapeHtml(relativeDeletedTime || '')})</span>
          </div>
          ` : ''}
          ${reason ? `
          <div class="diag-row">
            <span class="diag-label">ALASAN:</span>
            <span class="diag-value">${escapeHtml(reason)}</span>
          </div>
          ` : ''}
          <div class="diag-row">
            <span class="diag-label">UPSTREAM_SYNC:</span>
            <span class="diag-value">${escapeHtml(upstreamStatus || 'Catbox Synchronized')}</span>
          </div>
          <div class="diag-row">
            <span class="diag-label">DIAGNOSIS:</span>
            <span class="diag-value">${isDeleted ? 'Resource purged permanently from AirShare repository & upstream storage.' : 'Target resource does not exist or expired.'}</span>
          </div>
        </div>
      </div>

      <div class="actions">
        <a href="/" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          Unggah Berkas Baru
        </a>
        <a href="/api/health" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
          </svg>
          Periksa Status Server
        </a>
      </div>
    </div>

    <p class="footer-note">AirShare Pro Storage Network • Verifikasi Sinkronisasi Upstream Otomatis</p>
  </div>

  <textarea id="diagJson" style="display:none;">${escapeHtml(jsonString)}</textarea>

  <script>
${getShareErrorScripts()}
  </script>
</body>
</html>`;
}

export function renderNotFoundHtml(message: string): string {
  return renderThemedErrorHtml({
    title: 'Berkas Tidak Ditemukan — AirShare Pro',
    heading: 'Berkas Tidak Ditemukan',
    message,
    errorCode: 'ERR_MEDIA_NOT_FOUND',
    httpStatus: 404,
  });
}

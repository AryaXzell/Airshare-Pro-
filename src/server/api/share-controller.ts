import { Request, Response } from 'express';
import hljs from 'highlight.js';
import { getMediaRepository } from '../repository/media-repository';
import { analyticsRepository } from '../repository/analytics-repository';
import { checkUpstreamFileStatus } from '../storage/catbox-health-check';
import { PublicMediaView } from '../../types';
import { getFlagAssetPath } from '../../shared/flags';
import {
  isTextPreviewableFile,
  getTextLanguageHint,
  getTextLanguageInfo,
  MAX_TEXT_PREVIEW_BYTES,
} from '../../shared/text-language-map';

function splitHighlightedLines(html: string): string[] {
  const lines = html.split('\n');
  const result: string[] = [];
  const openTags: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prefix = openTags.join('');
    const tagRegex = /<span\s+class="([^"]+)">|<\/span>/g;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(line)) !== null) {
      if (match[0].startsWith('</')) {
        openTags.pop();
      } else {
        openTags.push(match[0]);
      }
    }
    const suffix = '</span>'.repeat(openTags.length);
    result.push(prefix + line + suffix);
  }
  return result;
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

function getFileCategoryIcon(mimeType: string, filename: string): string {
  const mime = mimeType.toLowerCase();
  const ext = (filename.split('.').pop() || '').toLowerCase();

  // Archive
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z') || mime.includes('tar') || mime.includes('gzip') || ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
    return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
      <path d="m3.3 7 8.7 5 8.7-5"/>
      <path d="M12 22V12"/>
      <path d="m7.5 4.5 9 5.2"/>
    </svg>`;
  }

  // PDF
  if (mime.includes('pdf') || ext === 'pdf') {
    return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
      <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
      <path d="M10 12h-1v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2Z"/>
      <path d="M6 12v6"/>
      <path d="M6 15h2"/>
    </svg>`;
  }

  // Document / Spreadsheet / Presentation
  if (mime.includes('word') || mime.includes('document') || mime.includes('sheet') || mime.includes('excel') || mime.includes('presentation') || ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
    return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
      <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
      <path d="M10 9H8"/>
      <path d="M16 13H8"/>
      <path d="M16 17H8"/>
    </svg>`;
  }

  // Default generic file
  return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
    <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
    <path d="M12 18v-6"/>
    <path d="m9 15 3 3 3-3"/>
  </svg>`;
}

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

export class ShareController {
  public async renderShareLanding(req: Request, res: Response): Promise<void> {
    const rawId = req.params.id;
    const requestId =
      (req as any).id ||
      (res.getHeader('X-Request-ID') as string) ||
      `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    if (!rawId || typeof rawId !== 'string' || !rawId.trim()) {
      res.status(400).send(
        ShareController.renderThemedErrorHtml({
          title: 'Format Tautan Tidak Valid — AirShare Pro',
          heading: 'Format Tautan Tidak Dikenali',
          message: 'Tautan berkas yang Anda buka memiliki format yang salah, kosong, atau tidak lengkap.',
          errorCode: 'ERR_INVALID_ID',
          httpStatus: 400,
          requestId,
        })
      );
      return;
    }

    const cleanId = rawId.trim();

    try {
      const repo = getMediaRepository();

      // Step 1: Check if this file was explicitly deleted (Tombstone detection)
      const tombstone = await repo.getTombstone(cleanId);
      if (tombstone) {
        const isUpstream = tombstone.reason === 'UPSTREAM_PURGED';
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.status(410).send(
          ShareController.renderThemedErrorHtml({
            title: isUpstream
              ? 'Berkas Telah Terhapus dari Upstream — AirShare Pro'
              : 'Berkas Telah Dihapus — AirShare Pro',
            heading: isUpstream ? 'Berkas Telah Dihapus dari Catbox' : 'Berkas Telah Dihapus',
            message: isUpstream
              ? 'Media fisik pada server penyimpanan Catbox telah terhapus atau kedaluwarsa, sehingga tautan ini tidak dapat lagi diakses.'
              : 'Berkas ini telah dihapus permanen oleh pemilik unggahan atau administrator sistem dan tidak lagi tersedia di jaringan.',
            errorCode: isUpstream ? 'ERR_UPSTREAM_PURGED' : 'ERR_MEDIA_DELETED',
            httpStatus: 410,
            itemId: cleanId,
            deletedAt: tombstone.deletedAt,
            reason: tombstone.reason,
            requestId,
          })
        );
        return;
      }

      // Step 2: Fetch public record from repository
      const item = await repo.getByIdPublic(cleanId);

      if (!item) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.status(404).send(
          ShareController.renderThemedErrorHtml({
            title: 'Berkas Tidak Ditemukan — AirShare Pro',
            heading: 'Berkas Tidak Ditemukan',
            message: 'Tautan berkas yang Anda akses tidak terdaftar di sistem atau masa berlakunya telah habis.',
            errorCode: 'ERR_MEDIA_NOT_FOUND',
            httpStatus: 404,
            itemId: cleanId,
            requestId,
          })
        );
        return;
      }

      // Step 3: Upstream verification with Catbox Cloud Storage
      // If the media was deleted directly from upstream Catbox, purge metadata and tombstone immediately
      if (item.shareUrl) {
        const upstreamStatus = await checkUpstreamFileStatus(item.shareUrl);
        if (upstreamStatus.isPurged) {
          // Asynchronously clean up stale Redis metadata to prevent future ghost lookups
          repo.deleteForAdmin(item.id).catch(() => {});
          repo.recordTombstone(item.id, 'UPSTREAM_PURGED').catch(() => {});
          analyticsRepository.removeRecentUpload(item.id).catch(() => {});

          console.warn(`[SHARE_SYNC] File ${item.id} detected as 404/410 on Catbox upstream. Tombstone recorded.`);

          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, max-age=0');
          res.status(410).send(
            ShareController.renderThemedErrorHtml({
              title: 'Berkas Telah Terhapus dari Catbox — AirShare Pro',
              heading: 'Berkas Telah Dihapus dari Catbox',
              message: 'Berkas ini sebelumnya tersinkronisasi, namun media fisik pada server Catbox telah dihapus atau kedaluwarsa.',
              errorCode: 'ERR_UPSTREAM_PURGED',
              httpStatus: 410,
              itemId: item.id,
              deletedAt: Date.now(),
              reason: 'Media fisik telah terhapus dari server penyimpanan Catbox upstream (HTTP 404/410)',
              upstreamUrl: item.shareUrl,
              upstreamStatus: `HTTP ${upstreamStatus.status} (Purged Upstream)`,
              requestId,
            })
          );
          return;
        }
      }

      const host = req.get('host') || 'localhost:3000';
      const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const currentUrl = `${protocol}://${host}/s/${encodeURIComponent(item.id)}`;

      // Record share view analytics fail-safely in background
      analyticsRepository.recordShareView(item.id).catch((statErr) => {
        console.warn('[ANALYTICS_WARN] Gagal mencatat share view:', statErr);
      });

      const html = await ShareController.renderSuccessHtml(item, currentUrl, host, protocol);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, private');
      res.status(200).send(html);
    } catch (err) {
      console.error('[SHARE_CONTROLLER_ERROR]', err);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(500).send(
        ShareController.renderThemedErrorHtml({
          title: 'Terjadi Kesalahan Sistem — AirShare Pro',
          heading: 'Gagal Memuat Berkas',
          message: 'Terjadi kendala saat memproses permintaan berkas. Silakan coba beberapa saat lagi.',
          errorCode: 'ERR_INTERNAL_SERVER',
          httpStatus: 500,
          itemId: cleanId,
          requestId,
        })
      );
    }
  }

  public static renderNotFoundHtml(message: string): string {
    return ShareController.renderThemedErrorHtml({
      title: 'Berkas Tidak Ditemukan — AirShare Pro',
      heading: 'Berkas Tidak Ditemukan',
      message,
      errorCode: 'ERR_MEDIA_NOT_FOUND',
      httpStatus: 404,
    });
  }

  public static renderThemedErrorHtml(options: ThemedErrorOptions): string {
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
    :root {
      --bg: #09090b;
      --card: #121216;
      --card-inner: #181820;
      --border: #27272a;
      --border-subtle: #202025;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --text-dim: #71717a;
      --accent: ${accentColor};
      --accent-glow: ${accentGlow};
      --blue: #3b82f6;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    body {
      background-color: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      position: relative;
      overflow-x: hidden;
    }
    /* Subtle background grid */
    body::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 360px;
      background: radial-gradient(circle at 50% 10%, rgba(59, 130, 246, 0.08) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }
    .wrapper {
      position: relative;
      z-index: 1;
      max-width: 520px;
      width: 100%;
    }
    /* Header Brand */
    .brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.625rem;
      margin-bottom: 1.5rem;
      text-decoration: none;
      color: var(--text);
    }
    .brand-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, #2563eb, #3b82f6);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .brand-title {
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .brand-tag {
      font-size: 0.7rem;
      padding: 0.15rem 0.45rem;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border);
      color: var(--text-dim);
      font-weight: 500;
    }
    /* Card Container */
    .card {
      background-color: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 2rem;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.03);
    }
    .status-badge-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background-color: var(--accent-glow);
      color: var(--accent);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: 9999px;
      padding: 0.3rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--accent);
      box-shadow: 0 0 8px var(--accent);
    }
    .req-id {
      font-size: 0.72rem;
      color: var(--text-dim);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .hero-icon-container {
      width: 60px;
      height: 60px;
      border-radius: 1rem;
      background-color: var(--accent-glow);
      color: var(--accent);
      border: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.25rem;
    }
    h1 {
      font-size: 1.4rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 0.6rem;
      color: var(--text);
      line-height: 1.3;
    }
    .desc {
      color: var(--text-muted);
      font-size: 0.9rem;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    /* Diagnostic Terminal Box */
    .diagnostic-box {
      background-color: var(--card-inner);
      border: 1px solid var(--border-subtle);
      border-radius: 0.85rem;
      overflow: hidden;
      margin-bottom: 1.75rem;
      text-align: left;
    }
    .diagnostic-header {
      background-color: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid var(--border-subtle);
      padding: 0.6rem 0.9rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .diagnostic-dots {
      display: flex;
      gap: 0.35rem;
      align-items: center;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .dot-red { background: #ef4444; }
    .dot-yellow { background: #f59e0b; }
    .dot-green { background: #10b981; }
    .diagnostic-title {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--text-dim);
    }
    .btn-copy {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 0.4rem;
      color: var(--text-muted);
      font-size: 0.72rem;
      padding: 0.25rem 0.55rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.2s;
    }
    .btn-copy:hover {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text);
      border-color: #3f3f46;
    }
    .diagnostic-body {
      padding: 0.85rem 1rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.76rem;
      line-height: 1.65;
    }
    .diag-row {
      display: flex;
      padding: 0.15rem 0;
    }
    .diag-label {
      color: var(--text-dim);
      width: 130px;
      flex-shrink: 0;
    }
    .diag-value {
      color: var(--text);
      word-break: break-all;
    }
    .diag-value.highlight-red { color: #f87171; font-weight: 600; }
    .diag-value.highlight-amber { color: #fbbf24; font-weight: 600; }
    .diag-value.highlight-blue { color: #60a5fa; }
    /* Action Buttons */
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    @media (max-width: 440px) {
      .actions { grid-template-columns: 1fr; }
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-radius: 0.75rem;
      font-size: 0.875rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn-primary {
      background-color: var(--blue);
      color: #fff;
    }
    .btn-primary:hover {
      background-color: #2563eb;
    }
    .btn-secondary {
      background-color: var(--card-inner);
      color: var(--text-muted);
      border-color: var(--border);
    }
    .btn-secondary:hover {
      background-color: #202028;
      color: var(--text);
    }
    /* Footer */
    .footer-note {
      text-align: center;
      margin-top: 1.5rem;
      font-size: 0.75rem;
      color: var(--text-dim);
    }
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
    function copyDiagnosticLog() {
      var text = document.getElementById('diagJson').value;
      var btn = document.getElementById('btnCopyLog');
      var label = document.getElementById('copyBtnText');

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(onCopied, fallbackCopy);
      } else {
        fallbackCopy();
      }

      function fallbackCopy() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          onCopied();
        } catch(e) {
          label.innerText = 'Gagal';
        }
        document.body.removeChild(ta);
      }

      function onCopied() {
        label.innerText = 'Tersalin!';
        btn.style.borderColor = '#10b981';
        btn.style.color = '#10b981';
        setTimeout(function() {
          label.innerText = 'Salin Log';
          btn.style.borderColor = '';
          btn.style.color = '';
        }, 2500);
      }
    }
  </script>
</body>
</html>`;
  }

  private static async renderSuccessHtml(
    item: PublicMediaView,
    currentUrl: string,
    host: string,
    protocol: string
  ): Promise<string> {
    const safeTitle = escapeHtml(item.name);
    const safeShareUrl = escapeHtml(item.shareUrl);
    const safeCurrentUrl = escapeHtml(currentUrl);
    const safeSize = escapeHtml(item.formattedSize);
    const safeExactDate = escapeHtml(formatExactDate(item.createdAt));
    const safeRelativeTime = escapeHtml(formatRelativeTime(item.createdAt));

    const isFile = item.type === 'file';
    const isImage = item.type === 'image';
    const isVideo = item.type === 'video';
    const isAudio = item.type === 'audio';
    const isPdf = isFile && (item.mimeType === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf'));
    const isText = isFile && !isPdf && (item.isTextPreviewable || isTextPreviewableFile(item.name, item.mimeType, item.size));

    let hasCodePreview = false;
    let codePreviewHtml = '';
    let rawTextContent = '';
    let textLineCount = 0;
    const langInfo = getTextLanguageInfo(item.name);

    if (isText && item.size <= MAX_TEXT_PREVIEW_BYTES) {
      try {
        const resp = await fetch(item.shareUrl, {
          signal: AbortSignal.timeout(6000),
        });
        if (resp.ok) {
          const text = await resp.text();
          if (text.length <= MAX_TEXT_PREVIEW_BYTES) {
            rawTextContent = text;
            const langHint = item.textLanguageHint || getTextLanguageHint(item.name);
            let highlighted = '';
            try {
              const isKnown = hljs.getLanguage(langHint);
              highlighted = isKnown
                ? hljs.highlight(text, { language: langHint, ignoreIllegals: true }).value
                : hljs.highlight(text, { language: 'plaintext' }).value;
            } catch {
              highlighted = escapeHtml(text);
            }
            const lines = splitHighlightedLines(highlighted);
            textLineCount = lines.length;
            const linesHtml = lines
              .map(
                (lineHtml, idx) =>
                  `<div class="code-line"><span class="code-line-num">${idx + 1}</span><span class="code-line-text">${lineHtml || '&nbsp;'}</span></div>`
              )
              .join('');

            codePreviewHtml = `
            <div class="code-viewer-box">
              <div class="code-viewer-bar">
                <div class="code-viewer-left">
                  <span class="code-lang-badge">${escapeHtml(langInfo.label)}</span>
                  <span class="code-meta-count">${textLineCount} baris • ${safeSize}</span>
                </div>
                <div class="code-viewer-actions">
                  <button class="code-btn" id="copy-code-btn" onclick="copyCodeContent()" aria-label="Salin isi berkas" type="button">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="copy-code-icon"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                    <span id="copy-code-text">Salin Isi</span>
                  </button>
                  <a href="${safeShareUrl}" target="_blank" rel="noopener noreferrer" class="code-btn" title="Buka berkas mentah di tab baru">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    <span>Lihat Mentah</span>
                  </a>
                </div>
              </div>
              <div class="code-scroll-pane">
                <div class="code-table">
                  ${linesHtml}
                </div>
              </div>
            </div>
            <script type="application/json" id="raw-code-payload">${JSON.stringify(rawTextContent)}</script>`;
            hasCodePreview = true;
          }
        }
      } catch (fetchErr) {
        console.warn('[SHARE_TEXT_PREVIEW_WARN] Gagal mengambil teks untuk pratinjau:', fetchErr);
      }
    }

    const safeDesc = isPdf
      ? `Dokumen PDF (${safeSize}) • Pratinjau langsung via AirShare Pro`
      : hasCodePreview
      ? `Berkas teks/kode ${escapeHtml(langInfo.label)} (${safeSize}) • Pratinjau langsung via AirShare Pro`
      : isFile
      ? `${safeSize} • Diunggah ${safeExactDate} via AirShare Pro`
      : `Berkas ${escapeHtml(item.type)} (${safeSize}) dibagikan via AirShare Pro`;

    // Flag logic
    const flagPath = getFlagAssetPath(item.uploaderCountryCode);
    const countryName = item.uploaderCountryName || (item.uploaderCountryCode ? item.uploaderCountryCode.toUpperCase() : null);
    const countryHtml = countryName
      ? `<span class="meta-item country-badge" title="Lokasi Pengunggah"><img src="${escapeHtml(flagPath)}" alt="${escapeHtml(countryName)}" class="flag-img" onerror="this.src='/flags/globe.svg'" /><span>${escapeHtml(countryName)}</span></span>`
      : `<span class="meta-item country-badge" title="Lokasi Pengunggah"><img src="/flags/globe.svg" alt="Lokasi tidak diketahui" class="flag-img" /><span>Lokasi tidak diketahui</span></span>`;

    let ogType = 'website';
    let ogMediaTag = '';
    let previewTag = '';

    if (isImage) {
      ogType = 'website';
      ogMediaTag = `<meta property="og:image" content="${safeShareUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${safeShareUrl}" />`;
      previewTag = `<div class="media-container"><img src="${safeShareUrl}" alt="${safeTitle}" /></div>`;
    } else if (isVideo) {
      ogType = 'video.other';
      ogMediaTag = `<meta property="og:video" content="${safeShareUrl}" />
  <meta property="og:video:type" content="${escapeHtml(item.mimeType)}" />
  <meta name="twitter:card" content="summary_large_image" />`;
      previewTag = `
      <div class="custom-player-wrapper custom-video-wrapper" id="video-wrapper">
        <video id="airshare-video" src="${safeShareUrl}" preload="metadata" playsinline></video>
        
        <!-- Big Center Play Button Overlay -->
        <button class="big-play-btn" id="big-play-btn" aria-label="Putar Video">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>

        <!-- Video Control Bar Overlay -->
        <div class="video-controls" id="video-controls">
          <!-- Scrubber Timeline -->
          <div class="timeline-bar" id="video-timeline" role="slider" aria-label="Posisi Video" tabindex="0">
            <div class="timeline-buffered" id="video-buffered"></div>
            <div class="timeline-progress" id="video-progress"></div>
            <div class="timeline-thumb" id="video-thumb"></div>
          </div>

          <!-- Controls Bottom Row -->
          <div class="controls-row">
            <div class="controls-left">
              <button class="ctrl-btn" id="vid-play-btn" aria-label="Putar atau jeda">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" id="vid-play-icon"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </button>
              <button class="ctrl-btn" id="vid-rewind-btn" title="Mundur 10 detik" aria-label="Mundur 10 detik">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>
              </button>
              <button class="ctrl-btn" id="vid-forward-btn" title="Maju 10 detik" aria-label="Maju 10 detik">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>
              </button>
              <span class="time-display" id="video-time-display">0:00 / 0:00</span>
            </div>

            <div class="controls-right">
              <!-- Speed -->
              <button class="ctrl-btn speed-badge" id="vid-speed-btn" title="Kecepatan putar">1x</button>

              <!-- PiP -->
              <button class="ctrl-btn" id="vid-pip-btn" title="Picture in Picture" aria-label="Picture in Picture">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="5" rx="2"/><rect width="7" height="5" x="12" y="12" rx="1"/></svg>
              </button>

              <!-- Fullscreen -->
              <button class="ctrl-btn" id="vid-fs-btn" title="Layar penuh" aria-label="Layar penuh">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="vid-fs-icon"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    } else if (isAudio) {
      ogType = 'music.song';
      ogMediaTag = `<meta property="og:audio" content="${safeShareUrl}" />
  <meta property="og:audio:type" content="${escapeHtml(item.mimeType)}" />
  <meta name="twitter:card" content="summary" />`;
      const songTitle = item.audioMeta?.title || item.name.replace(/\.[^/.]+$/, '');
      const artist = item.audioMeta?.artist || 'Artis Tidak Dikenal';
      const album = item.audioMeta?.album?.trim();
      const hasCover = !!item.audioMeta?.coverUrl;

      previewTag = `
      <div class="custom-player-wrapper custom-audio-wrapper" id="audio-wrapper">
        <audio id="airshare-audio" src="${safeShareUrl}" preload="metadata"></audio>
        
        <!-- Header Art & Metadata -->
        <div class="audio-header">
          <div class="audio-cover-box" id="audio-cover-box">
            ${
              hasCover
                ? `<img src="${escapeHtml(item.audioMeta!.coverUrl!)}" alt="Cover ${escapeHtml(songTitle)}" class="audio-cover-img" />`
                : `<div class="audio-vinyl-disc"><div class="vinyl-grooves"></div><div class="vinyl-center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></div></div>`
            }
          </div>
          <div class="audio-info">
            <h3 class="audio-title" title="${escapeHtml(songTitle)}">${escapeHtml(songTitle)}</h3>
            <p class="audio-artist" title="${escapeHtml(artist)}">${escapeHtml(artist)}</p>
            ${album ? `<p class="audio-album" title="${escapeHtml(album)}">${escapeHtml(album)}</p>` : ''}
          </div>
        </div>

        <!-- Audio Timeline Scrubber -->
        <div class="audio-timeline-wrap">
          <div class="timeline-bar" id="audio-timeline" role="slider" aria-label="Posisi Audio" tabindex="0">
            <div class="timeline-buffered" id="audio-buffered"></div>
            <div class="timeline-progress" id="audio-progress"></div>
            <div class="timeline-thumb" id="audio-thumb"></div>
          </div>
          <div class="audio-time-row">
            <span id="audio-cur-time">0:00</span>
            <span id="audio-dur-time">0:00</span>
          </div>
        </div>

        <!-- Audio Main Controls -->
        <div class="audio-controls-row">
          <button class="ctrl-btn speed-badge" id="aud-speed-btn" title="Kecepatan">1x</button>
          
          <div class="audio-playback-cluster">
            <button class="ctrl-btn" id="aud-rewind-btn" title="Mundur 10 detik" aria-label="Mundur 10 detik">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>
            </button>
            <button class="audio-main-play-btn" id="aud-play-btn" aria-label="Putar atau jeda audio">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" id="aud-play-icon"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
            <button class="ctrl-btn" id="aud-forward-btn" title="Maju 10 detik" aria-label="Maju 10 detik">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>
            </button>
          </div>
        </div>
      </div>`;
    } else if (isPdf) {
      ogType = 'website';
      const defaultOgImage = `${protocol}://${host}/og-image.svg`;
      ogMediaTag = `<meta property="og:image" content="${defaultOgImage}" />
  <meta name="twitter:card" content="summary" />`;
      previewTag = `
      <div class="pdf-viewer-box">
        <div class="pdf-viewer-bar">
          <div class="pdf-viewer-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>Pratinjau Dokumen PDF</span>
          </div>
          <div class="pdf-viewer-actions">
            <a href="${safeShareUrl}" target="_blank" rel="noopener noreferrer" class="pdf-ext-btn" title="Buka di tab penuh">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              <span>Tab Baru</span>
            </a>
          </div>
        </div>
        <div class="pdf-frame-wrapper">
          <iframe src="${safeShareUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH" class="pdf-iframe" title="${safeTitle}"></iframe>
        </div>
      </div>`;
    } else if (hasCodePreview) {
      ogType = 'website';
      const defaultOgImage = `${protocol}://${host}/og-image.svg`;
      ogMediaTag = `<meta property="og:image" content="${defaultOgImage}" />
  <meta name="twitter:card" content="summary" />`;
      previewTag = codePreviewHtml;
    } else if (isFile) {
      ogType = 'website';
      const defaultOgImage = `${protocol}://${host}/og-image.svg`;
      ogMediaTag = `<meta property="og:image" content="${defaultOgImage}" />
  <meta name="twitter:card" content="summary" />`;
      const fileIcon = getFileCategoryIcon(item.mimeType, item.name);
      previewTag = `<div class="file-hero-box">
        <div class="file-icon-badge">${fileIcon}</div>
        <div class="file-hero-meta">
          <span class="file-format-tag">${escapeHtml((item.name.split('.').pop() || 'FILE').toUpperCase())}</span>
        </div>
      </div>`;
    }

    // Refresh meta tag ONLY for images (no auto-redirect for file, video, audio)
    const refreshMetaTag = isImage
      ? `\n  <!-- 2-Second Meta Refresh Redirect to direct storage URL (images only) -->\n  <meta http-equiv="refresh" content="2;url=${safeShareUrl}" />`
      : '';

    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} — AirShare Pro</title>

  <!-- Open Graph Meta Tags -->
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:type" content="${ogType}" />
  <meta property="og:url" content="${safeCurrentUrl}" />
  <meta property="og:site_name" content="AirShare Pro" />
  ${ogMediaTag}

  <!-- Twitter Meta Tags -->
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  ${refreshMetaTag}

  <style>
    :root {
      --bg: #09090b;
      --card: #18181b;
      --card-gradient: linear-gradient(180deg, rgba(24, 24, 27, 0.95) 0%, rgba(18, 18, 20, 0.98) 100%);
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --border: #27272a;
      --border-accent: rgba(59, 130, 246, 0.2);
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --surface: #27272a;
      --surface-subtle: #202023;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
    .card { background: var(--card-gradient); border: 1px solid var(--border); border-radius: 1.5rem; padding: 1.75rem; max-width: 480px; width: 100%; box-shadow: 0 16px 40px -10px rgba(0,0,0,0.65); backdrop-filter: blur(16px); transition: max-width 0.2s ease; }
    .card-video { max-width: 640px; }
    .card-pdf { max-width: 860px; }
    .card-code { max-width: 920px; }
    .brand { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
    .brand-title { font-size: 0.8125rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 0.5rem; }
    .brand-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
    .badge { font-size: 0.75rem; font-weight: 600; padding: 0.25rem 0.65rem; border-radius: 9999px; background: var(--surface); color: var(--text); border: 1px solid var(--border); }
    
    /* Media Containers */
    .media-container { width: 100%; max-height: 260px; overflow: hidden; border-radius: 1rem; margin-bottom: 1.25rem; background: #000; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border); }
    .media-container img { width: 100%; max-height: 260px; object-fit: contain; }

    /* Custom Player Containers */
    .custom-player-wrapper {
      position: relative;
      width: 100%;
      border-radius: 1.25rem;
      overflow: hidden;
      margin-bottom: 1.25rem;
      border: 1px solid var(--border);
      background: #000;
      user-select: none;
    }
    .custom-video-wrapper {
      aspect-ratio: 16 / 9;
      max-height: 400px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .custom-video-wrapper video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }
    .big-play-btn {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: rgba(37, 99, 235, 0.9);
      color: #fff;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 5;
    }
    .big-play-btn:hover {
      transform: translate(-50%, -50%) scale(1.08);
      background: #3b82f6;
    }
    .big-play-btn.hidden {
      opacity: 0;
      pointer-events: none;
    }
    .video-controls {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 65%, transparent 100%);
      padding: 1.25rem 0.85rem 0.65rem 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      z-index: 6;
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    .video-controls.hidden {
      opacity: 0;
      pointer-events: none;
      transform: translateY(6px);
    }
    .timeline-bar {
      position: relative;
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 9999px;
      cursor: pointer;
      touch-action: none;
      transition: height 0.15s ease;
    }
    .timeline-bar:hover { height: 8px; }
    .timeline-buffered {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      width: 0%;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 9999px;
      pointer-events: none;
    }
    .timeline-progress {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      width: 0%;
      background: var(--accent);
      border-radius: 9999px;
      pointer-events: none;
    }
    .timeline-thumb {
      position: absolute;
      top: 50%;
      left: 0%;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 0 8px rgba(0,0,0,0.6);
      transform: translate(-50%, -50%) scale(0);
      transition: transform 0.15s ease;
      pointer-events: none;
    }
    .timeline-bar:hover .timeline-thumb,
    .timeline-bar:active .timeline-thumb {
      transform: translate(-50%, -50%) scale(1);
    }
    .controls-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .controls-left, .controls-right {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .ctrl-btn {
      background: transparent;
      border: none;
      color: #f4f4f5;
      padding: 0.35rem;
      border-radius: 0.4rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, color 0.15s;
      line-height: 1;
    }
    .ctrl-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
    }
    .speed-badge {
      font-size: 0.6875rem;
      font-weight: 700;
      padding: 0.2rem 0.45rem;
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 0.375rem;
    }
    .time-display {
      font-size: 0.75rem;
      font-variant-numeric: tabular-nums;
      color: #d4d4d8;
      margin-left: 0.35rem;
    }


    /* Custom Audio Player */
    .custom-audio-wrapper {
      background: linear-gradient(180deg, #1b1b22 0%, #131317 100%);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .audio-header {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .audio-cover-box {
      width: 64px;
      height: 64px;
      border-radius: 0.85rem;
      overflow: hidden;
      flex-shrink: 0;
      background: #27272a;
      box-shadow: 0 6px 16px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .audio-cover-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .audio-vinyl-disc {
      width: 100%;
      height: 100%;
      background: radial-gradient(circle, #2d2d34 0%, #18181b 60%, #0d0d10 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .vinyl-center {
      width: 28px;
      height: 28px;
      background: #2563eb;
      border-radius: 50%;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .spinning {
      animation: spinVinyl 6s linear infinite;
    }
    @keyframes spinVinyl {
      100% { transform: rotate(360deg); }
    }
    .audio-info {
      min-width: 0;
      flex: 1;
    }
    .audio-title {
      font-size: 0.9375rem;
      font-weight: 700;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .audio-artist {
      font-size: 0.8125rem;
      color: #a1a1aa;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 0.15rem;
    }
    .audio-album {
      font-size: 0.6875rem;
      color: #71717a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 0.1rem;
    }
    .audio-timeline-wrap {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .audio-time-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.6875rem;
      color: #a1a1aa;
      font-variant-numeric: tabular-nums;
    }
    .audio-controls-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .audio-playback-cluster {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .audio-main-play-btn {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--accent);
      color: #fff;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.15s, background 0.15s;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
    }
    .audio-main-play-btn:hover {
      background: #3b82f6;
      transform: scale(1.05);
    }

    /* PDF Viewer Box */
    .pdf-viewer-box {
      width: 100%;
      border-radius: 1rem;
      overflow: hidden;
      margin-bottom: 1.25rem;
      border: 1px solid var(--border);
      background: #141416;
      display: flex;
      flex-direction: column;
    }
    .pdf-viewer-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.6rem 0.85rem;
      background: #1e1e24;
      border-bottom: 1px solid var(--border);
      font-size: 0.75rem;
    }
    .pdf-viewer-badge {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-weight: 600;
      color: #f87171;
    }
    .pdf-ext-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.55rem;
      border-radius: 0.45rem;
      background: rgba(255,255,255,0.08);
      color: var(--text);
      text-decoration: none;
      font-size: 0.75rem;
      font-weight: 600;
      transition: background 0.15s;
    }
    .pdf-ext-btn:hover { background: rgba(255,255,255,0.15); }
    .pdf-frame-wrapper {
      width: 100%;
      height: min(520px, 60vh);
      background: #0f0f12;
      position: relative;
    }
    .pdf-iframe {
      width: 100%;
      height: 100%;
      border: none;
    }

    /* Clean Glass Code Viewer */
    .code-viewer-box {
      width: 100%;
      border-radius: 1rem;
      overflow: hidden;
      margin-bottom: 1.25rem;
      border: 1px solid var(--border);
      background: #0c0c10;
      display: flex;
      flex-direction: column;
      box-shadow: 0 12px 32px -8px rgba(0,0,0,0.5);
    }
    .code-viewer-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.65rem 0.95rem;
      background: #17171d;
      border-bottom: 1px solid var(--border);
      font-size: 0.75rem;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .code-viewer-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .code-lang-badge {
      display: inline-flex;
      align-items: center;
      font-weight: 700;
      font-size: 0.6875rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 0.2rem 0.5rem;
      border-radius: 0.375rem;
      background: rgba(37, 99, 235, 0.2);
      color: #93c5fd;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .code-meta-count {
      color: var(--muted);
      font-size: 0.75rem;
      font-variant-numeric: tabular-nums;
    }
    .code-viewer-actions {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .code-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.3rem 0.65rem;
      border-radius: 0.5rem;
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 0.75rem;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .code-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.18);
    }
    .code-btn.copied {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border-color: rgba(16, 185, 129, 0.4);
    }
    .code-scroll-pane {
      width: 100%;
      max-height: 520px;
      overflow: auto;
      background: #0a0a0d;
      padding: 0.75rem 0;
    }
    .code-table {
      display: flex;
      flex-direction: column;
      font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      line-height: 1.6;
      width: 100%;
    }
    .code-line {
      display: flex;
      align-items: flex-start;
      min-width: 100%;
      padding: 0 0.75rem;
      transition: background 0.1s;
    }
    .code-line:hover {
      background: rgba(255, 255, 255, 0.04);
    }
    .code-line-num {
      user-select: none;
      -webkit-user-select: none;
      color: #52525b;
      text-align: right;
      min-width: 2.75rem;
      padding-right: 1rem;
      flex-shrink: 0;
      font-size: 12px;
      opacity: 0.75;
    }
    .code-line:hover .code-line-num {
      color: #a1a1aa;
      opacity: 1;
    }
    .code-line-text {
      flex: 1;
      white-space: pre;
      word-break: normal;
      color: #e4e4e7;
    }

    /* Clean Glass Syntax Tokens */
    .hljs-keyword, .hljs-selector-tag, .hljs-built_in { color: #60a5fa; font-weight: 600; }
    .hljs-string, .hljs-attribute { color: #34d399; }
    .hljs-number, .hljs-literal { color: #c084fc; }
    .hljs-title, .hljs-title.function_, .hljs-name { color: #f472b6; }
    .hljs-tag { color: #93c5fd; }
    .hljs-attr { color: #38bdf8; }
    .hljs-comment, .hljs-quote { color: #71717a; font-style: italic; }
    .hljs-variable, .hljs-template-variable { color: #fbbf24; }
    .hljs-type, .hljs-class .hljs-title { color: #38bdf8; font-weight: 600; }
    .hljs-symbol, .hljs-bullet { color: #a78bfa; }
    .hljs-section { color: #f87171; font-weight: 700; }
    .hljs-emphasis { font-style: italic; }
    .hljs-strong { font-weight: 700; }
    
    /* MediaFire-style File Box */
    .file-hero-box {
      width: 100%;
      padding: 2.25rem 1.5rem;
      margin-bottom: 1.25rem;
      background: radial-gradient(circle at 50% 30%, rgba(37, 99, 235, 0.08) 0%, rgba(32, 32, 35, 0.6) 100%);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
    }
    .file-icon-badge {
      width: 76px;
      height: 76px;
      border-radius: 1.25rem;
      background: var(--surface);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #60a5fa;
      box-shadow: 0 8px 20px -4px rgba(0,0,0,0.4);
    }
    .file-hero-meta { display: flex; align-items: center; gap: 0.5rem; }
    .file-format-tag { font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.06em; padding: 0.2rem 0.5rem; border-radius: 0.375rem; background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.25); }

    h1 { font-size: 1.125rem; font-weight: 700; margin-bottom: 0.5rem; word-break: break-word; line-height: 1.4; }
    
    /* Metadata Strip */
    .metadata-strip {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }
    .meta-item {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8125rem;
      color: var(--muted);
    }
    .meta-divider {
      color: var(--border);
      font-size: 0.75rem;
    }
    .flag-img {
      width: 18px;
      height: 13px;
      object-fit: cover;
      border-radius: 2px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      display: inline-block;
      vertical-align: middle;
    }
    .country-badge {
      background: var(--surface-subtle);
      padding: 0.2rem 0.5rem;
      border-radius: 0.5rem;
      border: 1px solid var(--border);
      color: var(--text);
      font-weight: 500;
    }

    .progress-bar-wrap { width: 100%; height: 4px; background: var(--border); border-radius: 9999px; overflow: hidden; margin-bottom: 1.25rem; }
    .progress-bar-fill { height: 100%; background: var(--accent); width: 0%; animation: fillProgress 2s linear forwards; }
    @keyframes fillProgress { 0% { width: 0%; } 100% { width: 100%; } }
    .redirect-text { font-size: 0.75rem; color: var(--muted); text-align: center; margin-bottom: 1.25rem; }
    
    /* Buttons */
    .btn-group { display: flex; flex-direction: column; gap: 0.625rem; }
    .btn-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.8125rem 1.25rem; border-radius: 0.75rem; font-weight: 600; font-size: 0.875rem; text-decoration: none; cursor: pointer; transition: all 0.15s ease; border: none; }
    .btn-primary {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: #fff;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
    }
    .btn-primary:hover {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      box-shadow: 0 6px 18px rgba(37, 99, 235, 0.45);
      transform: translateY(-1px);
    }
    .btn-secondary { background-color: var(--surface); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background-color: #323238; border-color: #3f3f46; }

    /* Mobile Responsive Breakpoints */
    @media (max-width: 480px) {
      body { padding: 0.75rem; }
      .card { padding: 1.1rem; border-radius: 1.25rem; }
      .brand { margin-bottom: 1rem; }
      .metadata-strip { gap: 0.5rem; font-size: 0.75rem; margin-bottom: 1rem; padding-bottom: 0.85rem; }
      .custom-player-wrapper { margin-bottom: 1rem; border-radius: 1rem; }
      .video-controls { padding: 1rem 0.65rem 0.5rem 0.65rem; }
      .controls-left, .controls-right { gap: 0.25rem; }
      .ctrl-btn { padding: 0.3rem; }
      .speed-badge { font-size: 0.625rem; padding: 0.15rem 0.35rem; }
      .time-display { font-size: 0.6875rem; margin-left: 0.15rem; }
      .custom-audio-wrapper { padding: 1rem; gap: 0.85rem; }
      .audio-cover-box { width: 54px; height: 54px; border-radius: 0.75rem; }
      .audio-title { font-size: 0.875rem; }
      .audio-artist { font-size: 0.75rem; }
      .audio-album { font-size: 0.625rem; }
      .audio-playback-cluster { gap: 0.5rem; }
      .audio-main-play-btn { width: 40px; height: 40px; }
      .btn { padding: 0.75rem 1rem; font-size: 0.8125rem; }
      .file-hero-box { padding: 1.75rem 1rem; }
      .file-icon-badge { width: 64px; height: 64px; }
    }

    @media (max-width: 380px) {
      .controls-row {
        flex-direction: column;
        gap: 0.45rem;
      }
      .controls-left, .controls-right {
        width: 100%;
        justify-content: center;
      }
      .audio-controls-row {
        gap: 0.35rem;
      }
      .audio-playback-cluster {
        gap: 0.35rem;
      }
    }
  </style>
</head>
<body>
  <div class="card ${isPdf ? 'card-pdf' : ''} ${isVideo ? 'card-video' : ''} ${hasCodePreview ? 'card-code' : ''}">
    <div class="brand">
      <span class="brand-title"><span class="brand-dot"></span>AirShare Pro</span>
      <span class="badge">${escapeHtml(item.type.toUpperCase())}</span>
    </div>

    ${previewTag}

    <h1>${safeTitle}</h1>

    <div class="metadata-strip">
      <span class="meta-item" title="Ukuran Berkas">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        ${safeSize}
      </span>
      <span class="meta-divider">•</span>
      <span class="meta-item" id="upload-time-wrap" title="Waktu Unggah: ${safeExactDate}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span id="upload-time-text" data-timestamp="${item.createdAt || ''}">${safeExactDate} • ${safeRelativeTime}</span>
      </span>
      <span class="meta-divider">•</span>
      ${countryHtml}
    </div>

    ${
      isImage
        ? `<div class="progress-bar-wrap">
      <div class="progress-bar-fill"></div>
    </div>
    <div class="redirect-text">Mengarahkan ke berkas asli dalam 2 detik...</div>`
        : !isFile
        ? `<div class="redirect-text">Putar langsung di halaman ini, atau buka berkas asli dengan tombol di bawah.</div>`
        : ''
    }

    <div class="btn-group">
      ${
        isFile
          ? `<a href="${safeShareUrl}" class="btn btn-primary" id="download-btn" target="_blank" rel="noopener noreferrer" download>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Unduh Berkas (${safeSize})
            </a>
            <button class="btn btn-secondary" id="copy-btn" onclick="copyLink()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              Salin Tautan
            </button>`
          : `<div class="btn-row">
              <a href="${safeShareUrl}" class="btn btn-primary" id="open-btn">Buka Berkas</a>
              <button class="btn btn-secondary" id="copy-btn" onclick="copyLink()">Salin Tautan</button>
            </div>`
      }
    </div>
  </div>

  <script>
    function copyLink() {
      navigator.clipboard.writeText(window.location.href).then(function() {
        const btn = document.getElementById('copy-btn');
        if (!btn) return;
        const orig = btn.innerHTML;
        btn.innerText = 'Tersalin!';
        setTimeout(function() { btn.innerHTML = orig; }, 2000);
      });
    }

    function copyCodeContent() {
      var payloadEl = document.getElementById('raw-code-payload');
      var btn = document.getElementById('copy-code-btn');
      var textEl = document.getElementById('copy-code-text');
      var iconEl = document.getElementById('copy-code-icon');
      if (!payloadEl || !btn) return;
      try {
        var rawText = JSON.parse(payloadEl.textContent || '""');
        navigator.clipboard.writeText(rawText).then(function() {
          btn.classList.add('copied');
          if (textEl) textEl.textContent = 'Tersalin!';
          if (iconEl) iconEl.innerHTML = '<polyline points="20 6 9 17 4 12" stroke-width="2.5"/>';
          setTimeout(function() {
            btn.classList.remove('copied');
            if (textEl) textEl.textContent = 'Salin Isi';
            if (iconEl) iconEl.innerHTML = '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>';
          }, 2000);
        });
      } catch (e) {
        console.error('Gagal menyalin isi kode:', e);
      }
    }

    function formatTime(secs) {
      if (!secs || isNaN(secs) || secs < 0) return '0:00';
      var m = Math.floor(secs / 60);
      var s = Math.floor(secs % 60);
      return m + ':' + (s < 10 ? '0' + s : s);
    }

    // --- VIDEO PLAYER CONTROLS ---
    (function initVideoPlayer() {
      var video = document.getElementById('airshare-video');
      if (!video) return;

      var wrap = document.getElementById('video-wrapper');
      var controls = document.getElementById('video-controls');
      var bigPlayBtn = document.getElementById('big-play-btn');
      var playBtn = document.getElementById('vid-play-btn');
      var playIcon = document.getElementById('vid-play-icon');
      var rewindBtn = document.getElementById('vid-rewind-btn');
      var forwardBtn = document.getElementById('vid-forward-btn');
      var timeDisplay = document.getElementById('video-time-display');
      var timeline = document.getElementById('video-timeline');
      var progress = document.getElementById('video-progress');
      var buffered = document.getElementById('video-buffered');
      var thumb = document.getElementById('video-thumb');
      var speedBtn = document.getElementById('vid-speed-btn');
      var pipBtn = document.getElementById('vid-pip-btn');
      var fsBtn = document.getElementById('vid-fs-btn');

      var speeds = [1, 1.25, 1.5, 2];
      var speedIdx = 0;
      var hideTimer = null;

      function updatePlayState(playing) {
        if (playing) {
          playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
          if (bigPlayBtn) bigPlayBtn.classList.add('hidden');
          scheduleControlsHide();
        } else {
          playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
          if (bigPlayBtn) bigPlayBtn.classList.remove('hidden');
          if (controls) controls.classList.remove('hidden');
        }
      }

      function togglePlay() {
        if (video.paused || video.ended) {
          video.play().catch(function() {});
        } else {
          video.pause();
        }
      }

      if (bigPlayBtn) bigPlayBtn.addEventListener('click', togglePlay);
      if (playBtn) playBtn.addEventListener('click', togglePlay);
      video.addEventListener('click', function() {
        if (controls && controls.classList.contains('hidden')) {
          controls.classList.remove('hidden');
          scheduleControlsHide();
          return;
        }
        togglePlay();
      });

      video.addEventListener('play', function() { updatePlayState(true); });
      video.addEventListener('pause', function() { updatePlayState(false); });
      video.addEventListener('ended', function() { updatePlayState(false); });

      if (rewindBtn) rewindBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        video.currentTime = Math.max(0, video.currentTime - 10);
      });
      if (forwardBtn) forwardBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
      });

      // Time & Progress update
      video.addEventListener('timeupdate', function() {
        var cur = video.currentTime || 0;
        var dur = video.duration || 0;
        if (timeDisplay) timeDisplay.textContent = formatTime(cur) + ' / ' + formatTime(dur);
        if (dur > 0 && !isSeeking) {
          var pct = (cur / dur) * 100;
          if (progress) progress.style.width = pct + '%';
          if (thumb) thumb.style.left = pct + '%';
        }
      });

      // Buffered update
      video.addEventListener('progress', function() {
        if (video.buffered.length > 0 && video.duration) {
          var bufEnd = video.buffered.end(video.buffered.length - 1);
          var pct = (bufEnd / video.duration) * 100;
          if (buffered) buffered.style.width = pct + '%';
        }
      });

      // Seeking
      var isSeeking = false;
      function seek(e) {
        if (!timeline || !video.duration) return;
        var rect = timeline.getBoundingClientRect();
        var clientX = e.clientX !== undefined ? e.clientX : (e.touches ? e.touches[0].clientX : 0);
        var pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        if (progress) progress.style.width = (pos * 100) + '%';
        if (thumb) thumb.style.left = (pos * 100) + '%';
        video.currentTime = pos * video.duration;
      }

      if (timeline) {
        timeline.addEventListener('pointerdown', function(e) {
          isSeeking = true;
          seek(e);
          function onPointerMove(ev) { if (isSeeking) seek(ev); }
          function onPointerUp() {
            isSeeking = false;
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
          }
          window.addEventListener('pointermove', onPointerMove);
          window.addEventListener('pointerup', onPointerUp);
        });
      }

      // Speed
      if (speedBtn) {
        speedBtn.addEventListener('click', function() {
          speedIdx = (speedIdx + 1) % speeds.length;
          var s = speeds[speedIdx];
          video.playbackRate = s;
          speedBtn.textContent = s + 'x';
        });
      }

      // PiP
      if (pipBtn) {
        if ('pictureInPictureEnabled' in document) {
          pipBtn.addEventListener('click', function() {
            if (document.pictureInPictureElement) {
              document.exitPictureInPicture();
            } else {
              video.requestPictureInPicture().catch(function() {});
            }
          });
        } else {
          pipBtn.style.display = 'none';
        }
      }

      // Fullscreen
      if (fsBtn) {
        fsBtn.addEventListener('click', function() {
          if (!document.fullscreenElement) {
            wrap.requestFullscreen().catch(function() {});
          } else {
            document.exitFullscreen().catch(function() {});
          }
        });
      }

      // Inactivity autohide
      function scheduleControlsHide() {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(function() {
          if (!video.paused && controls) {
            controls.classList.add('hidden');
          }
        }, 2500);
      }
      if (wrap) {
        wrap.addEventListener('mousemove', function() {
          if (controls) controls.classList.remove('hidden');
          scheduleControlsHide();
        });
        wrap.addEventListener('touchstart', function() {
          if (controls) controls.classList.remove('hidden');
          scheduleControlsHide();
        }, { passive: true });
      }
    })();

    // --- AUDIO PLAYER CONTROLS ---
    (function initAudioPlayer() {
      var audio = document.getElementById('airshare-audio');
      if (!audio) return;

      var playBtn = document.getElementById('aud-play-btn');
      var playIcon = document.getElementById('aud-play-icon');
      var rewindBtn = document.getElementById('aud-rewind-btn');
      var forwardBtn = document.getElementById('aud-forward-btn');
      var curTime = document.getElementById('audio-cur-time');
      var durTime = document.getElementById('audio-dur-time');
      var timeline = document.getElementById('audio-timeline');
      var progress = document.getElementById('audio-progress');
      var buffered = document.getElementById('audio-buffered');
      var thumb = document.getElementById('audio-thumb');
      var speedBtn = document.getElementById('aud-speed-btn');
      var coverBox = document.getElementById('audio-cover-box');

      var speeds = [1, 1.25, 1.5, 2];
      var speedIdx = 0;

      function updatePlayState(playing) {
        if (playing) {
          playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
          if (coverBox) coverBox.classList.add('spinning');
        } else {
          playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
          if (coverBox) coverBox.classList.remove('spinning');
        }
      }

      function togglePlay() {
        if (audio.paused || audio.ended) {
          audio.play().catch(function() {});
        } else {
          audio.pause();
        }
      }

      if (playBtn) playBtn.addEventListener('click', togglePlay);
      audio.addEventListener('play', function() { updatePlayState(true); });
      audio.addEventListener('pause', function() { updatePlayState(false); });
      audio.addEventListener('ended', function() { updatePlayState(false); });

      if (rewindBtn) rewindBtn.addEventListener('click', function() {
        audio.currentTime = Math.max(0, audio.currentTime - 10);
      });
      if (forwardBtn) forwardBtn.addEventListener('click', function() {
        audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
      });

      audio.addEventListener('timeupdate', function() {
        var cur = audio.currentTime || 0;
        var dur = audio.duration || 0;
        if (curTime) curTime.textContent = formatTime(cur);
        if (durTime) durTime.textContent = formatTime(dur);
        if (dur > 0 && !isSeeking) {
          var pct = (cur / dur) * 100;
          if (progress) progress.style.width = pct + '%';
          if (thumb) thumb.style.left = pct + '%';
        }
      });

      audio.addEventListener('loadedmetadata', function() {
        if (durTime && audio.duration) {
          durTime.textContent = formatTime(audio.duration);
        }
      });

      audio.addEventListener('progress', function() {
        if (audio.buffered.length > 0 && audio.duration) {
          var bufEnd = audio.buffered.end(audio.buffered.length - 1);
          var pct = (bufEnd / audio.duration) * 100;
          if (buffered) buffered.style.width = pct + '%';
        }
      });

      var isSeeking = false;
      function seek(e) {
        if (!timeline || !audio.duration) return;
        var rect = timeline.getBoundingClientRect();
        var clientX = e.clientX !== undefined ? e.clientX : (e.touches ? e.touches[0].clientX : 0);
        var pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        if (progress) progress.style.width = (pos * 100) + '%';
        if (thumb) thumb.style.left = (pos * 100) + '%';
        audio.currentTime = pos * audio.duration;
      }

      if (timeline) {
        timeline.addEventListener('pointerdown', function(e) {
          isSeeking = true;
          seek(e);
          function onPointerMove(ev) { if (isSeeking) seek(ev); }
          function onPointerUp() {
            isSeeking = false;
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
          }
          window.addEventListener('pointermove', onPointerMove);
          window.addEventListener('pointerup', onPointerUp);
        });
      }

      if (speedBtn) {
        speedBtn.addEventListener('click', function() {
          speedIdx = (speedIdx + 1) % speeds.length;
          var s = speeds[speedIdx];
          audio.playbackRate = s;
          speedBtn.textContent = s + 'x';
        });
      }
    })();

    try {
      var timeEl = document.getElementById('upload-time-text');
      if (timeEl && timeEl.dataset.timestamp) {
        var ts = parseInt(timeEl.dataset.timestamp, 10);
        if (!isNaN(ts) && ts > 0) {
          var uploadDate = new Date(ts);
          var now = Date.now();
          var diffMs = now - ts;
          var diffSecs = Math.max(0, Math.floor(diffMs / 1000));
          var rel = 'Baru saja';
          if (diffSecs >= 60) {
            var diffMins = Math.floor(diffSecs / 60);
            if (diffMins < 60) rel = diffMins + ' menit lalu';
            else {
              var diffHours = Math.floor(diffMins / 60);
              if (diffHours < 24) rel = diffHours + ' jam lalu';
              else {
                var diffDays = Math.floor(diffHours / 24);
                if (diffDays < 30) rel = diffDays + ' hari lalu';
                else rel = Math.floor(diffDays / 30) + ' bulan lalu';
              }
            }
          }
          var formattedLocale = uploadDate.toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          timeEl.textContent = formattedLocale + ' • ' + rel;
          var wrap = document.getElementById('upload-time-wrap');
          if (wrap) {
            wrap.title = 'Waktu Unggah: ' + uploadDate.toLocaleString();
          }
        }
      }
    } catch (e) {}
  </script>
</body>
</html>`;
  }
}

export const shareController = new ShareController();


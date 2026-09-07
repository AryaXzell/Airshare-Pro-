import { Request, Response } from 'express';
import hljs from 'highlight.js';
import { getMediaRepository } from '../repository/media-repository';
import { analyticsRepository } from '../repository/analytics-repository';
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

export class ShareController {
  public async renderShareLanding(req: Request, res: Response): Promise<void> {
    const id = req.params.id;
    if (!id || typeof id !== 'string' || !id.trim()) {
      res.status(400).send(ShareController.renderNotFoundHtml('ID berkas tidak valid.'));
      return;
    }

    try {
      const repo = getMediaRepository();
      const item = await repo.getByIdPublic(id.trim());

      if (!item) {
        res.status(404).send(ShareController.renderNotFoundHtml('Tautan berkas tidak ditemukan atau sudah kedaluwarsa.'));
        return;
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
      res.status(500).send(ShareController.renderNotFoundHtml('Terjadi kesalahan saat memuat berkas.'));
    }
  }

  private static renderNotFoundHtml(message: string): string {
    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Berkas Tidak Ditemukan — AirShare Pro</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #18181b;
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --border: #27272a;
      --accent: #2563eb;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
    .card { background-color: var(--card); border: 1px solid var(--border); border-radius: 1.5rem; padding: 2rem; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
    .icon { width: 48px; height: 48px; margin: 0 auto 1.25rem; border-radius: 1rem; background: rgba(239, 68, 68, 0.15); color: #ef4444; display: flex; align-items: center; justify-content: center; }
    h1 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; }
    p { color: var(--muted); font-size: 0.875rem; line-height: 1.5; margin-bottom: 1.5rem; }
    .btn { display: inline-block; background-color: var(--accent); color: #fff; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 0.75rem; font-weight: 600; font-size: 0.875rem; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
    </div>
    <h1>Berkas Tidak Ditemukan</h1>
    <p>${escapeHtml(message)}</p>
    <a href="/" class="btn">Kembali ke Beranda</a>
  </div>
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
              <!-- Volume -->
              <div class="vol-control">
                <button class="ctrl-btn" id="vid-vol-btn" aria-label="Bisu atau bersuara">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="vid-vol-icon"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                </button>
                <input type="range" class="vol-slider" id="vid-vol-slider" min="0" max="1" step="0.05" value="1" aria-label="Volume" />
              </div>

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
      const album = item.audioMeta?.album || 'AirShare Audio';
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
            <p class="audio-album" title="${escapeHtml(album)}">${escapeHtml(album)}</p>
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

          <div class="vol-control">
            <button class="ctrl-btn" id="aud-vol-btn" aria-label="Volume">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="aud-vol-icon"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
            </button>
            <input type="range" class="vol-slider" id="aud-vol-slider" min="0" max="1" step="0.05" value="1" aria-label="Volume audio" />
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
    .vol-control {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .vol-slider {
      width: 55px;
      height: 4px;
      accent-color: var(--accent);
      cursor: pointer;
      border-radius: 9999px;
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
      height: 520px;
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
      var volBtn = document.getElementById('vid-vol-btn');
      var volIcon = document.getElementById('vid-vol-icon');
      var volSlider = document.getElementById('vid-vol-slider');
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
      video.addEventListener('click', togglePlay);

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

      // Volume
      if (volSlider) {
        volSlider.addEventListener('input', function(e) {
          var val = parseFloat(e.target.value);
          video.volume = val;
          video.muted = val === 0;
          updateVolIcon();
        });
      }
      if (volBtn) {
        volBtn.addEventListener('click', function() {
          video.muted = !video.muted;
          if (!video.muted && video.volume === 0) {
            video.volume = 0.5;
            if (volSlider) volSlider.value = 0.5;
          }
          updateVolIcon();
        });
      }
      function updateVolIcon() {
        if (!volIcon) return;
        if (video.muted || video.volume === 0) {
          volIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
        } else {
          volIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
        }
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
      var volBtn = document.getElementById('aud-vol-btn');
      var volIcon = document.getElementById('aud-vol-icon');
      var volSlider = document.getElementById('aud-vol-slider');
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

      if (volSlider) {
        volSlider.addEventListener('input', function(e) {
          var val = parseFloat(e.target.value);
          audio.volume = val;
          audio.muted = val === 0;
          updateVolIcon();
        });
      }
      if (volBtn) {
        volBtn.addEventListener('click', function() {
          audio.muted = !audio.muted;
          if (!audio.muted && audio.volume === 0) {
            audio.volume = 0.5;
            if (volSlider) volSlider.value = 0.5;
          }
          updateVolIcon();
        });
      }
      function updateVolIcon() {
        if (!volIcon) return;
        if (audio.muted || audio.volume === 0) {
          volIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
        } else {
          volIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
        }
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


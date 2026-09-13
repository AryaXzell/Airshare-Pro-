import hljs from 'highlight.js';
import { PublicMediaView } from '../../../types';
import { getFlagAssetPath } from '../../../shared/flags';
import {
  isTextPreviewableFile,
  getTextLanguageHint,
  getTextLanguageInfo,
  MAX_TEXT_PREVIEW_BYTES,
} from '../../../shared/text-language-map';
import { getShareBaseCss } from '../styles/share-base.css';
import { getShareClientScripts } from '../scripts/share-players.client';

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

  // Code / Web / Script
  if (
    mime.includes('javascript') ||
    mime.includes('typescript') ||
    mime.includes('json') ||
    mime.includes('html') ||
    mime.includes('css') ||
    mime.includes('xml') ||
    mime.includes('php') ||
    mime.includes('python') ||
    mime.includes('markdown') ||
    ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'rb', 'swift', 'kt', 'sql', 'html', 'css', 'json', 'md', 'sh'].includes(ext)
  ) {
    return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="16 18 22 12 16 6"/>
      <polyline points="8 6 2 12 8 18"/>
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

export async function renderSuccessHtml(
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
    const defaultOgImage = `${protocol}://${host}/og-image.png`;
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
    const defaultOgImage = `${protocol}://${host}/og-image.png`;
    ogMediaTag = `<meta property="og:image" content="${defaultOgImage}" />
  <meta name="twitter:card" content="summary" />`;
    previewTag = codePreviewHtml;
  } else if (isFile) {
    ogType = 'website';
    const defaultOgImage = `${protocol}://${host}/og-image.png`;
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
${getShareBaseCss()}
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
${getShareClientScripts()}
  </script>
</body>
</html>`;
}

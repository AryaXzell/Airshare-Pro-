import { Request, Response } from 'express';
import { getMediaRepository } from '../repository/media-repository';

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

      const html = ShareController.renderSuccessHtml(item, currentUrl);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 mins
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

  private static renderSuccessHtml(item: { id: string; name: string; type: string; formattedSize: string; shareUrl: string; mimeType: string }, currentUrl: string): string {
    const safeTitle = escapeHtml(item.name);
    const safeDesc = `Berkas ${escapeHtml(item.type)} (${escapeHtml(item.formattedSize)}) dibagikan via AirShare Pro`;
    const safeShareUrl = escapeHtml(item.shareUrl);
    const safeCurrentUrl = escapeHtml(currentUrl);

    let ogType = 'website';
    let ogMediaTag = '';
    let previewTag = '';

    if (item.type === 'image') {
      ogType = 'website';
      ogMediaTag = `<meta property="og:image" content="${safeShareUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${safeShareUrl}" />`;
      previewTag = `<div class="media-container"><img src="${safeShareUrl}" alt="${safeTitle}" /></div>`;
    } else if (item.type === 'video') {
      ogType = 'video.other';
      ogMediaTag = `<meta property="og:video" content="${safeShareUrl}" />
  <meta property="og:video:type" content="${escapeHtml(item.mimeType)}" />
  <meta name="twitter:card" content="summary_large_image" />`;
      previewTag = `<div class="media-container"><video src="${safeShareUrl}" controls preload="metadata"></video></div>`;
    } else if (item.type === 'audio') {
      ogType = 'music.song';
      ogMediaTag = `<meta property="og:audio" content="${safeShareUrl}" />
  <meta property="og:audio:type" content="${escapeHtml(item.mimeType)}" />
  <meta name="twitter:card" content="summary" />`;
      previewTag = `<div class="audio-container"><audio src="${safeShareUrl}" controls preload="metadata" style="width: 100%;"></audio></div>`;
    }

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

  <!-- 2-Second Meta Refresh Redirect to direct storage URL -->
  <meta http-equiv="refresh" content="2;url=${safeShareUrl}" />

  <style>
    :root {
      --bg: #09090b;
      --card: #18181b;
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --border: #27272a;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --surface: #27272a;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
    .card { background-color: var(--card); border: 1px solid var(--border); border-radius: 1.5rem; padding: 1.75rem; max-width: 480px; width: 100%; box-shadow: 0 10px 30px -5px rgba(0,0,0,0.6); }
    .brand { display: flex; items-center; justify-content: space-between; margin-bottom: 1.25rem; }
    .brand-title { font-size: 0.8125rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .badge { font-size: 0.75rem; font-weight: 600; padding: 0.25rem 0.6rem; border-radius: 9999px; background: var(--surface); color: var(--text); }
    .media-container { width: 100%; max-height: 260px; overflow: hidden; border-radius: 1rem; margin-bottom: 1.25rem; background: #000; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border); }
    .media-container img, .media-container video { width: 100%; max-height: 260px; object-fit: contain; }
    .audio-container { margin-bottom: 1.25rem; padding: 0.75rem; background: var(--surface); border-radius: 1rem; border: 1px solid var(--border); }
    h1 { font-size: 1.125rem; font-weight: 700; margin-bottom: 0.35rem; word-break: break-word; }
    .meta-info { color: var(--muted); font-size: 0.8125rem; margin-bottom: 1.25rem; }
    .progress-bar-wrap { width: 100%; height: 4px; background: var(--border); border-radius: 9999px; overflow: hidden; margin-bottom: 1.25rem; }
    .progress-bar-fill { height: 100%; background: var(--accent); width: 0%; animation: fillProgress 2s linear forwards; }
    @keyframes fillProgress { 0% { width: 0%; } 100% { width: 100%; } }
    .redirect-text { font-size: 0.75rem; color: var(--muted); text-align: center; margin-bottom: 1.25rem; }
    .btn-group { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .btn { display: flex; align-items: center; justify-content: center; padding: 0.75rem 1rem; border-radius: 0.75rem; font-weight: 600; font-size: 0.8125rem; text-decoration: none; cursor: pointer; transition: all 0.15s; border: none; }
    .btn-primary { background-color: var(--accent); color: #fff; }
    .btn-primary:hover { background-color: var(--accent-hover); }
    .btn-secondary { background-color: var(--surface); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background-color: #323238; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <span class="brand-title">AirShare Pro</span>
      <span class="badge">${escapeHtml(item.type.toUpperCase())}</span>
    </div>

    ${previewTag}

    <h1>${safeTitle}</h1>
    <div class="meta-info">${escapeHtml(item.formattedSize)} • ${escapeHtml(item.mimeType)}</div>

    <div class="progress-bar-wrap">
      <div class="progress-bar-fill"></div>
    </div>
    <div class="redirect-text">Mengarahkan ke berkas asli dalam 2 detik...</div>

    <div class="btn-group">
      <a href="${safeShareUrl}" class="btn btn-primary" id="open-btn">Buka Berkas</a>
      <button class="btn btn-secondary" id="copy-btn" onclick="copyLink()">Salin Tautan</button>
    </div>
  </div>

  <script>
    function copyLink() {
      navigator.clipboard.writeText(window.location.href).then(function() {
        const btn = document.getElementById('copy-btn');
        btn.innerText = 'Tersalin!';
        setTimeout(function() { btn.innerText = 'Salin Tautan'; }, 2000);
      });
    }
  </script>
</body>
</html>`;
  }
}

export const shareController = new ShareController();

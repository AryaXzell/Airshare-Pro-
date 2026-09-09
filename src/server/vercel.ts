import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from './app';

const FUNCTION_MAX_DURATION_MS = 60000;
const catboxTimeoutMs = parseInt(process.env.CATBOX_TIMEOUT_MS || '60000', 10);

if (catboxTimeoutMs > FUNCTION_MAX_DURATION_MS) {
  console.warn(
    `[CONFIG_WARN] CATBOX_TIMEOUT_MS (${catboxTimeoutMs}ms) dikonfigurasi melebihi serverless maxDuration (${FUNCTION_MAX_DURATION_MS}ms). Permintaan berisiko diputus lebih awal oleh Vercel.`
  );
}

// Disable Vercel's default body parser so Express & Multer receive the raw multipart stream directly
export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Resolve original request path in Vercel Serverless environment.
  // When vercel.json rewrites /s/:id or /superadmin to /api?__vpath=...,
  // restore req.url so Express routes (/s/:id, /superadmin, etc.) match correctly.
  let queryVPath: string | undefined;
  if (req.query && typeof req.query.__vpath === 'string') {
    queryVPath = req.query.__vpath;
  } else if (req.url && req.url.includes('__vpath=')) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      queryVPath = parsedUrl.searchParams.get('__vpath') || undefined;
    } catch {
      const match = req.url.match(/[?&]__vpath=([^&]+)/);
      if (match) {
        queryVPath = decodeURIComponent(match[1]);
      }
    }
  }

  const forwardedUri = (req.headers['x-forwarded-uri'] || req.headers['x-matched-path']) as string | undefined;

  let targetPath = queryVPath;
  if (!targetPath && forwardedUri && !forwardedUri.startsWith('/api')) {
    targetPath = forwardedUri;
  }

  if (targetPath) {
    const normalizedPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;

    // Clean up internal __vpath from req.query so downstream code is clean
    if (req.query && '__vpath' in req.query) {
      delete req.query.__vpath;
    }

    const currentUrl = req.url || '';
    const queryIdx = currentUrl.indexOf('?');
    if (queryIdx !== -1) {
      const qs = currentUrl.slice(queryIdx);
      const cleanQs = qs.replace(/[?&]__vpath=[^&]*/, '').replace(/^&/, '?');
      req.url = normalizedPath + (cleanQs.length > 1 ? cleanQs : '');
    } else {
      req.url = normalizedPath;
    }
  }

  return app(req, res);
}

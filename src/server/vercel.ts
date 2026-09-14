import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from './app';

/**
 * PERINGATAN TENTANG VERCEL HOBBY PLAN vs PRO:
 * Konfigurasi `maxDuration: 60` di vercel.json HANYA berlaku untuk akun Vercel Pro atau Enterprise.
 * Pada akun Vercel Gratis (Hobby Plan), Vercel secara sepihak memaksakan batas maksimal eksekusi fungsi
 * sebesar 10 detik (hard limit), terlepas dari konfigurasi maxDuration yang ada di vercel.json.
 * Jika aplikasi dideploy di atas akun Hobby, setiap operasi (termasuk upload ke Catbox atau polling Redis)
 * yang membutuhkan waktu lebih dari 10 detik akan diputus secara paksa oleh platform Vercel dengan HTTP 504 Gateway Timeout.
 * Untuk lingkungan produksi berskala besar, pertimbangkan upgrade ke Vercel Pro atau deploy service backend
 * ke container mandiri (Docker/Railway/VPS/Cloud Run).
 */
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
  // When vercel.json rewrites /s/:id or /admin to /api?__vpath=...,
  // restore req.url so Express routes (/s/:id, /admin, etc.) match correctly.
  let queryVPath: string | undefined;
  if (req.query) {
    if (typeof req.query.__vpath === 'string') {
      queryVPath = req.query.__vpath;
    } else if (Array.isArray(req.query.__vpath) && req.query.__vpath.length > 0) {
      queryVPath = req.query.__vpath[0];
    }
  }

  if (!queryVPath && req.url && req.url.includes('__vpath=')) {
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

  if (!queryVPath && forwardedUri) {
    console.warn('[VERCEL_ROUTING_DIAGNOSTIC] __vpath tidak ditemukan pada query, menggunakan fallback header routing. Path:', forwardedUri, '| URL asli:', req.url, '| Headers terkait:', JSON.stringify({
      'x-forwarded-uri': req.headers['x-forwarded-uri'],
      'x-matched-path': req.headers['x-matched-path'],
      'x-vercel-id': req.headers['x-vercel-id'],
    }));
  }

  let targetPath = queryVPath;
  if (!targetPath && forwardedUri) {
    targetPath = forwardedUri;
  }

  // Debug routing variables inside Vercel Serverless environment
  console.log('[VERCEL_ROUTING_DEBUG]', {
    method: req.method,
    originalUrl: req.url,
    forwardedUri,
    queryVPath,
    targetPath,
    hasCookie: !!req.headers.cookie,
    cookiesCount: req.headers.cookie ? req.headers.cookie.split(';').length : 0,
    hasAuthToken: !!req.headers.cookie?.includes('admin_auth_token'),
    nodeEnv: process.env.NODE_ENV,
    secretKeyConfigured: !!process.env.ADMIN_SECRET_KEY,
    secretKeyLength: process.env.ADMIN_SECRET_KEY?.length || 0
  });

  // If invoked directly at serverless root (/ or /api) without a specific subpath
  if (!targetPath && (!req.url || req.url === '/' || req.url === '/api' || req.url.startsWith('/api?'))) {
    targetPath = '/api';
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
      try {
        const dummyUrl = new URL(currentUrl, 'http://localhost');
        dummyUrl.searchParams.delete('__vpath');
        const remainingQuery = dummyUrl.search;
        req.url = normalizedPath + remainingQuery;
      } catch {
        const qs = currentUrl.slice(queryIdx);
        const cleanQs = qs.replace(/[?&]__vpath=[^&]*/g, '').replace(/^[?&]+/, '?');
        req.url = normalizedPath + (cleanQs !== '?' ? cleanQs : '');
      }
    } else {
      req.url = normalizedPath;
    }
    // Synchronize originalUrl so Express route matching and request logging reflect the actual restored path
    (req as unknown as { originalUrl: string }).originalUrl = req.url;
  }

  return app(req as any, res as any);
}

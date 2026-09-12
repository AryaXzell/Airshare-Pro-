import express, { Express, Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { mediaRouter } from './api/routes';
import { shareController } from './api/share-controller';
import { adminController } from './api/admin-controller';
import { statusController, getSystemStatusData } from './api/status-controller';
import { getAdminConfig, requireAdminAuth } from './security/admin-auth';
import { isMaintenanceModeActive, getAnnouncement, getFeatureFlags } from './security/system-config';
import { standardRateLimiter } from './security/rate-limiter';
import { requestLoggerMiddleware } from './security/request-logger';
import { sessionMiddleware } from './security/session';
import { checkRedisHealth } from './storage/redis-client';
import { checkCatboxHealth } from './storage/catbox-health-check';
import { telegramWebhookController } from './api/telegram-webhook-controller';
import { getTelegramConfig } from './telegram/telegram-auth';
import { alertRedisFailure } from './telegram/telegram-notifier';
import { ApiErrorResponse } from '../types';

export function createExpressApp(): Express {
  const app = express();
  const isDev = process.env.NODE_ENV !== 'production';

  // Cookie parser middleware for session cookie extraction
  app.use(cookieParser());

  // Anonymous session scoping middleware
  app.use(sessionMiddleware);

  // Request ID and Structured Logging Middleware
  app.use(requestLoggerMiddleware);

  // Security & Hardening Headers Middleware
  app.use((req, res, next) => {
    // Prevent MIME-sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Cross-origin referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Restrict access to sensitive device APIs not used by the app
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
    );
    // Disable legacy XSS auditor to prevent edge-case bypasses
    res.setHeader('X-XSS-Protection', '0');

    // Strict-Transport-Security (HSTS) in production
    if (!isDev) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Comprehensive Content-Security-Policy (CSP)
    const cspDirectives = [
      "default-src 'self'",
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://files.catbox.moe https://*.catbox.moe",
      "media-src 'self' data: blob: https://files.catbox.moe https://*.catbox.moe",
      isDev
        ? "connect-src 'self' data: blob: ws: wss: http: https: https://catbox.moe https://*.catbox.moe"
        : "connect-src 'self' data: blob: https://files.catbox.moe https://catbox.moe https://*.catbox.moe",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      isDev
        ? "frame-ancestors 'self' https://*.google.com https://*.googleusercontent.com https://ai.studio https://*.ai.studio https://*.aistudio.google.com https://*.run.app https://*.cloudshell.dev"
        : "frame-ancestors 'self'",
    ];

    res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

    // Handle CORS preflight cleanly
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Request-ID, Accept'
      );
      res.setHeader('Access-Control-Max-Age', '86400');
      res.status(204).end();
      return;
    }

    next();
  });

  // Body parsers for JSON and URL-encoded (aligned with Vercel 4.5MB payload limit)
  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true, limit: '4mb' }));

  // Middleware to catch JSON body parsing syntax errors gracefully
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400 && 'body' in err) {
      const errorResp: ApiErrorResponse = {
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Format data JSON pada body permintaan tidak valid.',
        },
      };
      res.status(400).json(errorResp);
      return;
    }
    next(err);
  });

  // Health check endpoint (GET only) with real Redis and Catbox verification
  const healthHandler = async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    try {
      const [redisHealth, catboxHealth] = await Promise.all([
        checkRedisHealth(),
        checkCatboxHealth(),
      ]);

      const isDegraded = redisHealth.configured && !redisHealth.connected;
      if (isDegraded) {
        alertRedisFailure('Koneksi ke cluster Redis terputus atau melebihi batas waktu (timeout)').catch(() => {});
      }

      res.json({
        status: isDegraded ? 'degraded' : 'ok',
        service: 'AirShare Pro API',
        timestamp: new Date().toISOString(),
        storageProvider: 'catbox',
        hasUserhash: Boolean(process.env.CATBOX_USERHASH?.trim()),
        redis: {
          configured: redisHealth.configured,
          connected: redisHealth.connected,
          latencyMs: redisHealth.latencyMs,
        },
        catbox: {
          available: catboxHealth.available,
          latencyMs: catboxHealth.latencyMs,
        },
      });
    } catch (err: unknown) {
      console.error('[HEALTH_CHECK_ERROR]', err);
      res.status(500).json({
        status: 'error',
        service: 'AirShare Pro API',
        timestamp: new Date().toISOString(),
        message: 'Gagal menjalankan pemeriksaan kesehatan sistem.',
      });
    }
  };

  const healthMethodNotAllowed = (req: Request, res: Response) => {
    res.setHeader('Allow', 'GET');
    const errorResp: ApiErrorResponse = {
      success: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: `Metode ${req.method} tidak diizinkan pada endpoint health check. Gunakan GET.`,
      },
    };
    res.status(405).json(errorResp);
  };

  app.route('/api/health').get(healthHandler).all(healthMethodNotAllowed);
  app.route('/health').get(healthHandler).all(healthMethodNotAllowed);

  // Root API descriptor endpoint
  app.get(['/api', '/api/'], (req: Request, res: Response) => {
    res.json({
      success: true,
      service: 'AirShare Pro API',
      status: 'operational',
      version: '1.0.0',
      endpoints: {
        health: '/api/health',
        systemStatus: '/api/system-status',
        config: '/api/media/config',
        upload: '/api/media/upload',
        media: '/api/media',
      },
    });
  });

  // Dynamic robots.txt to explicitly allow / and /status, while disallowing admin, api, and private share endpoints
  app.get('/robots.txt', (req: Request, res: Response) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host') || 'airshare-pro.vercel.app';
    const baseUrl = `${protocol}://${host}`;
    const content = `User-agent: *\nAllow: /\nAllow: /status\nDisallow: /api/\nDisallow: /admin/\nDisallow: /admin\nDisallow: /s/\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(content);
  });

  // Dynamic sitemap.xml with / and /status indexing support
  app.get('/sitemap.xml', (req: Request, res: Response) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host') || 'airshare-pro.vercel.app';
    const baseUrl = `${protocol}://${host}`;
    const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/status</loc>
    <changefreq>hourly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(sitemapContent);
  });

  // Mount Admin Panel (Enabled if ADMIN_SECRET_KEY is configured)
  const adminConfig = getAdminConfig();
  if (adminConfig.enabled) {
    const basePath = '/admin';

    // Root of admin path -> redirect to dashboard (will hit requireAdminAuth)
    app.get([basePath, `${basePath}/`], (req: Request, res: Response) => {
      res.redirect(`${basePath}/dashboard`);
    });

    // Admin Authentication Endpoints
    app.get(`${basePath}/login`, (req: Request, res: Response) => {
      return adminController.renderLoginPage(req, res);
    });
    app.post(`${basePath}/login`, (req: Request, res: Response) => {
      return adminController.handleLogin(req, res);
    });
    app.all(`${basePath}/logout`, (req: Request, res: Response) => {
      return adminController.handleLogout(req, res);
    });

    // Admin Dashboard (Strictly protected by requireAdminAuth middleware)
    app.get(`${basePath}/dashboard`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.renderDashboard(req, res);
    });

    // Admin Real-Time Live Stats API (Strictly protected by requireAdminAuth middleware)
    app.get(`${basePath}/api/live-stats`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.getLiveStats(req, res);
    });

    // Admin Permanent Delete from Catbox & Database (Strictly protected by requireAdminAuth)
    app.post(`${basePath}/api/delete-permanent`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.deletePermanent(req, res);
    });

    // Admin Delete from History Only (Strictly protected by requireAdminAuth)
    app.post(`${basePath}/api/delete-history-only`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.deleteHistoryOnly(req, res);
    });

    // Admin Health-Check Synchronization with Catbox (Strictly protected by requireAdminAuth)
    app.post(`${basePath}/api/sync-check`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.runSyncCheck(req, res);
    });

    // Admin Purge Broken / 404 Files
    app.post(`${basePath}/api/purge-broken`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.purgeBrokenFiles(req, res);
    });

    // Admin Dynamic System Config API
    app.post(`${basePath}/api/config`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.updateConfig(req, res);
    });

    // Admin Toggle Maintenance Kill Switch
    app.post(`${basePath}/api/maintenance`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.toggleMaintenance(req, res);
    });

    // Admin Session Management APIs
    app.post(`${basePath}/api/revoke-session`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.revokeSession(req, res);
    });
    app.post(`${basePath}/api/revoke-all-sessions`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.revokeAllSessions(req, res);
    });

    // Admin Search Files in Repository
    app.get(`${basePath}/api/search`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.searchFiles(req, res);
    });

    // Admin Bulk Cleanup (Preview & Execute)
    app.post(`${basePath}/api/bulk-cleanup/preview`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.previewBulkCleanup(req, res);
    });
    app.post(`${basePath}/api/bulk-cleanup`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.executeBulkCleanup(req, res);
    });

    // Admin Telegram Bot status
    app.get(`${basePath}/api/telegram-status`, requireAdminAuth, (req: Request, res: Response) => {
      const config = getTelegramConfig();
      res.json({
        success: true,
        data: {
          enabled: config.enabled,
          adminCount: config.adminUserIds.length,
          hasSecret: Boolean(config.webhookSecret),
        },
      });
    });

    // Admin Deleted Files Management APIs
    app.get(`${basePath}/api/deleted-files`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.getDeletedFiles(req, res);
    });
    app.post(`${basePath}/api/clear-deleted-history`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.clearDeletedHistory(req, res);
    });

    // Admin Real-Time Gemini AI System Recommendations & Summary API
    app.all(`${basePath}/api/ai-recommendations`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.getAiRecommendations(req, res);
    });

    // Fallback for unhandled subroutes under /admin
    app.all(`${basePath}/*`, requireAdminAuth, (req: Request, res: Response) => {
      res.status(404).send('<!DOCTYPE html><html><body>404 Not Found</body></html>');
    });
  } else {
    // If admin panel is not yet configured, render a clean setup guidance page
    app.all(['/admin', '/admin/*'], (req: Request, res: Response) => {
      res.status(503).send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Panel — Konfigurasi Diperlukan</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b101b; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; box-sizing: border-box; }
    .card { background: #131c2e; border: 1px solid #23324d; border-radius: 16px; max-width: 520px; width: 100%; padding: 2.25rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); text-align: center; }
    h1 { font-size: 1.35rem; font-weight: 700; margin-bottom: 0.75rem; color: #38bdf8; }
    p { font-size: 0.9rem; line-height: 1.6; color: #94a3b8; margin-bottom: 1.5rem; }
    .code-box { background: #080c14; border: 1px solid #1e293b; border-radius: 10px; padding: 1rem; text-align: left; font-family: monospace; font-size: 0.85rem; color: #e2e8f0; margin-bottom: 1.5rem; line-height: 1.6; }
    .code-box .key { color: #38bdf8; font-weight: 600; }
    .code-box .val { color: #34d399; }
    a { display: inline-block; background: #0284c7; color: #fff; text-decoration: none; padding: 0.7rem 1.5rem; border-radius: 8px; font-weight: 600; font-size: 0.9rem; }
    a:hover { background: #0369a1; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Admin Panel Memerlukan Konfigurasi</h1>
    <p>Panel Admin dinonaktifkan secara aman karena kunci rahasia belum disetel di Environment Variables hosting / Vercel Anda. Panel admin selalu diakses di path <code>/admin</code>.</p>
    <div class="code-box">
      <span class="key">ADMIN_SECRET_KEY</span>=<span class="val">kunci-rahasia-minimal-16-karakter</span>
    </div>
    <p style="font-size: 0.8rem; margin-bottom: 1.5rem; color: #64748b;">Tambahkan di Settings &gt; Environment Variables Vercel, lalu redeploy project Anda.</p>
    <a href="/">Kembali ke Halaman Utama</a>
  </div>
</body>
</html>`);
    });
  }

  // Public System Status HTML Page (Accessible even in full lockdown)
  app.get(['/status', '/status/'], (req: Request, res: Response) => {
    return statusController.renderStatusPage(req, res);
  });

  // Public System Status API (Maintenance Mode, Announcement Banner, Feature Flags, Services Health)
  app.get(['/api/system-status', '/system-status'], standardRateLimiter, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    try {
      const data = await getSystemStatusData();
      res.json({
        success: true,
        data,
      });
    } catch (err: unknown) {
      console.error('[SYSTEM_STATUS_ERROR]', err);
      res.status(500).json({
        success: false,
        error: {
          code: 'SYSTEM_STATUS_ERROR',
          message: 'Gagal memuat status sistem.',
        },
      });
    }
  });

  // Mount Public Share Landing Page (/s/:id) with Open Graph preview
  app.get(['/s', '/s/'], (req: Request, res: Response) => {
    res.redirect('/');
  });

  app.get('/s/:id', (req: Request, res: Response) => {
    return shareController.renderShareLanding(req, res);
  });

  // Telegram Bot Webhook Endpoint
  app.post('/api/telegram/webhook', (req: Request, res: Response) => {
    return telegramWebhookController.handleWebhook(req, res);
  });

  // Mount API media routes
  app.use('/api/media', mediaRouter);
  app.use('/media', mediaRouter);

  // Unhandled API route fallback
  app.all(['/api', '/api/*', '/media', '/media/*'], (req: Request, res: Response) => {
    const errorResp: ApiErrorResponse = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint API '${req.method} ${req.path}' tidak ditemukan.`,
      },
    };
    res.status(404).json(errorResp);
  });

  // Central error handling middleware
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error('[UNHANDLED_ERROR]', err);
    const errorResp: ApiErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Terjadi kesalahan internal pada server.',
      },
    };
    res.status(500).json(errorResp);
  });

  return app;
}

export const app = createExpressApp();
export default app;

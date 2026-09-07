import express, { Express, Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { mediaRouter } from './api/routes';
import { shareController } from './api/share-controller';
import { adminController } from './api/admin-controller';
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

  // Enable Trust Proxy for reverse proxy / Vercel deployment IP resolution
  app.set('trust proxy', 1);

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

  // Body parsers for JSON and URL-encoded
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

  // Dynamic robots.txt to strictly disallow crawling of admin path and sensitive endpoints
  app.get('/robots.txt', (req: Request, res: Response) => {
    const adminConfig = getAdminConfig();
    let content = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /s/\n`;
    if (adminConfig.enabled && adminConfig.panelPath) {
      content += `Disallow: /${adminConfig.panelPath}/\n`;
    }
    content += `\nSitemap: https://airshare-pro.vercel.app/sitemap.xml\n`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(content);
  });

  // Mount Hidden Admin Panel (Only enabled if ADMIN_SECRET_KEY and ADMIN_PANEL_PATH are configured)
  const adminConfig = getAdminConfig();
  if (adminConfig.enabled && adminConfig.panelPath) {
    const adminBase = `/${adminConfig.panelPath}`;

    // Root of admin path -> redirect to dashboard (will hit requireAdminAuth)
    app.get(adminBase, (req: Request, res: Response) => {
      res.redirect(`${adminBase}/dashboard`);
    });

    // Admin Authentication Endpoints
    app.get(`${adminBase}/login`, (req: Request, res: Response) => {
      return adminController.renderLoginPage(req, res);
    });
    app.post(`${adminBase}/login`, (req: Request, res: Response) => {
      return adminController.handleLogin(req, res);
    });
    app.all(`${adminBase}/logout`, (req: Request, res: Response) => {
      return adminController.handleLogout(req, res);
    });

    // Admin Dashboard (Strictly protected by requireAdminAuth middleware)
    app.get(`${adminBase}/dashboard`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.renderDashboard(req, res);
    });

    // Admin Real-Time Live Stats API (Strictly protected by requireAdminAuth middleware)
    app.get(`${adminBase}/api/live-stats`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.getLiveStats(req, res);
    });

    // Admin Permanent Delete from Catbox & Database (Strictly protected by requireAdminAuth)
    app.post(`${adminBase}/api/delete-permanent`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.deletePermanent(req, res);
    });

    // Admin Delete from History Only (Strictly protected by requireAdminAuth)
    app.post(`${adminBase}/api/delete-history-only`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.deleteHistoryOnly(req, res);
    });

    // Admin Health-Check Synchronization with Catbox (Strictly protected by requireAdminAuth)
    app.post(`${adminBase}/api/sync-check`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.runSyncCheck(req, res);
    });

    // Admin Dynamic System Config API
    app.post(`${adminBase}/api/config`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.updateConfig(req, res);
    });

    // Admin Toggle Maintenance Kill Switch
    app.post(`${adminBase}/api/maintenance`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.toggleMaintenance(req, res);
    });

    // Admin Session Management APIs
    app.post(`${adminBase}/api/revoke-session`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.revokeSession(req, res);
    });
    app.post(`${adminBase}/api/revoke-all-sessions`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.revokeAllSessions(req, res);
    });

    // Admin Search Files in Repository
    app.get(`${adminBase}/api/search`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.searchFiles(req, res);
    });

    // Admin Bulk Cleanup (Preview & Execute)
    app.post(`${adminBase}/api/bulk-cleanup/preview`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.previewBulkCleanup(req, res);
    });
    app.post(`${adminBase}/api/bulk-cleanup`, requireAdminAuth, (req: Request, res: Response) => {
      return adminController.executeBulkCleanup(req, res);
    });

    // Admin Telegram Bot status
    app.get(`${adminBase}/api/telegram-status`, requireAdminAuth, (req: Request, res: Response) => {
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

    // Fallback for unhandled subroutes under the secret admin path
    app.all(`${adminBase}/*`, requireAdminAuth, (req: Request, res: Response) => {
      res.status(404).send('<!DOCTYPE html><html><body>404 Not Found</body></html>');
    });
  }

  // Public System Status API (Maintenance Mode, Announcement Banner, Feature Flags)
  app.get(['/api/system-status', '/system-status'], standardRateLimiter, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const [maintenanceMode, rawAnnouncement, featureFlags] = await Promise.all([
      isMaintenanceModeActive(),
      getAnnouncement(),
      getFeatureFlags(),
    ]);

    const activeAnnouncement = rawAnnouncement && rawAnnouncement.enabled ? rawAnnouncement : null;

    res.json({
      success: true,
      data: {
        maintenanceMode,
        announcement: activeAnnouncement,
        featureFlags,
      },
    });
  });

  // Mount Public Share Landing Page (/s/:id) with Open Graph preview
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
  app.all(['/api/*', '/media/*'], (req: Request, res: Response) => {
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

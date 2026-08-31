import express, { Express, Request, Response, NextFunction } from 'express';
import { mediaRouter } from './api/routes';
import { requestLoggerMiddleware } from './security/request-logger';
import { ApiErrorResponse } from '../types';

export function createExpressApp(): Express {
  const app = express();
  const isDev = process.env.NODE_ENV !== 'production';

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
      "img-src 'self' data: blob: https://files.catbox.moe https://*.catbox.moe https://images.unsplash.com",
      "media-src 'self' data: blob: https://files.catbox.moe https://*.catbox.moe",
      isDev
        ? "connect-src 'self' data: blob: ws: wss: http: https: https://catbox.moe https://*.catbox.moe"
        : "connect-src 'self' data: blob: https://files.catbox.moe https://catbox.moe https://*.catbox.moe",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self' https://*.google.com https://*.googleusercontent.com https://ai.studio https://*.ai.studio https://*.aistudio.google.com https://*.run.app https://*.cloudshell.dev",
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

  // Health check endpoint (GET only)
  const healthHandler = (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({
      status: 'ok',
      service: 'AirShare Pro API',
      timestamp: new Date().toISOString(),
      storageProvider: 'catbox',
      hasUserhash: Boolean(process.env.CATBOX_USERHASH?.trim()),
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

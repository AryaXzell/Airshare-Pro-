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
      "frame-ancestors 'self' https://*.google.com https://*.googleusercontent.com https://ai.studio https://*.aistudio.google.com https://*.run.app",
    ];

    res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
    next();
  });

  // Body parsers for JSON and URL-encoded
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Health check endpoint
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

  app.get('/api/health', healthHandler);
  app.get('/health', healthHandler);

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

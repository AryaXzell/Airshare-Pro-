import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { mediaRouter } from './src/server/api/routes';
import { requestLoggerMiddleware } from './src/server/security/request-logger';
import { ApiErrorResponse } from './src/types';

async function startServer() {
  const app = express();
  const PORT = 3000;
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

    // Comprehensive Content-Security-Policy (CSP) - configured to allow AI Studio iframe embedding
    const cspDirectives = [
      "default-src 'self'",
      // Scripts: self, inline for Vite/React dev & runtime
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      // Styles: self, Google Fonts, inline Tailwind classes
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fonts: Google Fonts CDN
      "font-src 'self' https://fonts.gstatic.com data:",
      // Images: self, blob:, data:, Catbox files, and CDN assets
      "img-src 'self' data: blob: https://files.catbox.moe https://*.catbox.moe https://images.unsplash.com",
      // Media: self, blob:, data:, Catbox files
      "media-src 'self' data: blob: https://files.catbox.moe https://*.catbox.moe",
      // Connect / API / WebSocket: self, Catbox endpoints, and Vite HMR in dev
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

  // Body parsers for JSON and URL-encoded with safe limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // API Routes mounted first
  app.use('/api/media', mediaRouter);

  // Health check endpoint with provider status check
  app.get('/api/health', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({
      status: 'ok',
      service: 'AirShare Pro API',
      timestamp: new Date().toISOString(),
      storageProvider: 'catbox',
      hasUserhash: Boolean(process.env.CATBOX_USERHASH?.trim()),
    });
  });

  // Unhandled API route fallback
  app.all('/api/*', (req, res) => {
    const errorResp: ApiErrorResponse = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint API '${req.method} ${req.path}' tidak ditemukan.`,
      },
    };
    res.status(404).json(errorResp);
  });

  // Vite middleware in development vs Static serving with optimized caching in production
  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');

    // Static assets with long-term immutable cache (Vite hashes file names)
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );

    // Other static files
    app.use(
      express.static(distPath, {
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );

    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Central error handling middleware (Never exposes stack traces or secrets to clients)
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AirShare Pro server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

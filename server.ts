import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createExpressApp } from './src/server/app';
import { ApiErrorResponse } from './src/types';

async function startServer() {
  const app = createExpressApp();
  const PORT = 3000;
  const isDev = process.env.NODE_ENV !== 'production';

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

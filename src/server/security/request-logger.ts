import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getClientIp } from './client-ip';

export interface RequestLogEntry {
  requestId: string;
  timestamp: string;
  method: string;
  url: string;
  ip: string;
  status: number;
  durationMs: number;
  contentLength?: string;
  errorCode?: string;
}

/**
 * Generates a collision-resistant, safe request ID.
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Middleware that assigns a unique X-Request-ID to each incoming request
 * and outputs structured, security-sanitized log lines upon response completion.
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const incomingReqId = req.headers['x-request-id'] as string;
  const requestId = incomingReqId && /^[a-zA-Z0-9_-]{8,64}$/.test(incomingReqId)
    ? incomingReqId
    : generateRequestId();

  // Attach to request object and response header
  (req as unknown as { id: string }).id = requestId;
  res.setHeader('X-Request-ID', requestId);

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const clientIp = getClientIp(req);

    // Mask IPv4 / IPv6 for privacy compliance (keep prefix)
    const maskedIp = clientIp.includes('.')
      ? clientIp.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, '$1.$2.***.$4')
      : clientIp.includes(':')
      ? clientIp.split(':').slice(0, 3).join(':') + ':****'
      : clientIp;

    const logEntry: RequestLogEntry = {
      requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl || req.url,
      ip: maskedIp,
      status: res.statusCode,
      durationMs,
      contentLength: res.getHeader('content-length') as string | undefined,
    };

    // Print safe structured JSON log on server console
    if (res.statusCode >= 500) {
      console.error(`[API_ERROR] ${JSON.stringify(logEntry)}`);
    } else if (res.statusCode >= 400) {
      console.warn(`[API_WARN] ${JSON.stringify(logEntry)}`);
    } else if (process.env.NODE_ENV !== 'production' || logEntry.url.startsWith('/api')) {
      console.log(`[API_INFO] ${JSON.stringify(logEntry)}`);
    }
  });

  next();
}

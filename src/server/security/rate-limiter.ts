import { Request, Response, NextFunction } from 'express';
import { ApiErrorResponse } from '../../types';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTimeMs: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

/**
 * Sliding Window In-Memory Rate Limiter.
 * Safe for single-process and serverless node instances.
 * In a distributed multi-instance deployment (e.g. Vercel Edge/Redis),
 * this interface can be backed by Upstash Redis or KV store.
 */
export class SlidingWindowRateLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; expiresAt: number }>();
  private lastCleanup = Date.now();

  private cleanup(now: number) {
    if (now - this.lastCleanup < 30000) return;
    this.lastCleanup = now;
    for (const [key, val] of this.buckets.entries()) {
      if (val.expiresAt <= now) {
        this.buckets.delete(key);
      }
    }
  }

  public async check(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    const now = Date.now();
    this.cleanup(now);

    const bucket = this.buckets.get(key);

    if (!bucket || bucket.expiresAt <= now) {
      this.buckets.set(key, {
        count: 1,
        expiresAt: now + windowMs,
      });
      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        resetTimeMs: now + windowMs,
      };
    }

    if (bucket.count < limit) {
      bucket.count += 1;
      return {
        allowed: true,
        limit,
        remaining: limit - bucket.count,
        resetTimeMs: bucket.expiresAt,
      };
    }

    return {
      allowed: false,
      limit,
      remaining: 0,
      resetTimeMs: bucket.expiresAt,
    };
  }
}

export const defaultRateLimiter = new SlidingWindowRateLimiter();

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  keyPrefix?: string;
  limiter?: RateLimiter;
}

/**
 * Express middleware to enforce IP-based rate limiting on sensitive API endpoints.
 */
export function rateLimitMiddleware(options: RateLimitOptions) {
  const {
    limit,
    windowMs,
    keyPrefix = 'rl',
    limiter = defaultRateLimiter,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Extract client IP safely (respecting trusted proxy headers if present)
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown-ip';

    const key = `${keyPrefix}:${clientIp}`;

    try {
      const result = await limiter.check(key, limit, windowMs);

      const resetSeconds = Math.max(1, Math.ceil((result.resetTimeMs - Date.now()) / 1000));
      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', resetSeconds);

      if (!result.allowed) {
        res.setHeader('Retry-After', resetSeconds);
        const errorResponse: ApiErrorResponse = {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: `Terlalu banyak permintaan. Silakan tunggu ${resetSeconds} detik sebelum mencoba kembali.`,
          },
        };
        res.status(429).json(errorResponse);
        return;
      }

      next();
    } catch (err) {
      // In case of rate limiter error, fail-open to preserve core uptime but log warning
      console.warn('Rate limiter error, failing open:', err);
      next();
    }
  };
}

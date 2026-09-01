import { Request, Response, NextFunction } from 'express';
import { ApiErrorResponse } from '../../types';
import { getClientIp } from './client-ip';
import { getRedisClient, isUpstashConfigured } from '../storage/redis-client';
import { Redis } from '@upstash/redis';

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
 * Safe for single-process and development environments.
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

/**
 * Distributed Atomic Rate Limiter backed by Upstash Redis.
 * Uses atomic pipeline (INCR + EXPIRE) for high-performance serverless rate limiting.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(private redis: Redis) {}

  public async check(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    const redisKey = `rl:${key}`;

    try {
      const pipeline = this.redis.pipeline();
      pipeline.incr(redisKey);
      pipeline.ttl(redisKey);
      const results = await pipeline.exec();

      const count = Number(results[0]) || 1;
      let ttl = Number(results[1]);

      // If key has no TTL (first increment or newly created), set its expiration
      if (ttl === -1 || ttl === -2 || count === 1) {
        await this.redis.expire(redisKey, windowSeconds);
        ttl = windowSeconds;
      }

      const resetTimeMs = now + Math.max(1, ttl) * 1000;
      const allowed = count <= limit;
      const remaining = Math.max(0, limit - count);

      return {
        allowed,
        limit,
        remaining,
        resetTimeMs,
      };
    } catch (err) {
      console.warn('[REDIS_RATE_LIMIT_ERROR] Gagal mengecek rate limit di Redis, fail-open:', err);
      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        resetTimeMs: now + windowMs,
      };
    }
  }
}

/**
 * Returns the default rate limiter instance based on runtime environment.
 */
export function getRateLimiter(): RateLimiter {
  if (isUpstashConfigured()) {
    const redis = getRedisClient();
    if (redis) {
      return new RedisRateLimiter(redis);
    }
  }
  return defaultRateLimiter;
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
    limiter,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const activeLimiter = limiter || getRateLimiter();
    const clientIp = getClientIp(req);
    const key = `${keyPrefix}:${clientIp}`;

    try {
      const result = await activeLimiter.check(key, limit, windowMs);

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

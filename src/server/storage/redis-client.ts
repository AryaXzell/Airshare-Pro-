import { Redis } from '@upstash/redis';

let redisInstance: Redis | null = null;

/**
 * Checks if Upstash Redis credentials are provided in the environment.
 */
export function isUpstashConfigured(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return Boolean(url && token);
}

/**
 * Returns a singleton Redis instance or null if unconfigured.
 */
export function getRedisClient(): Redis | null {
  if (!isUpstashConfigured()) {
    return null;
  }

  if (!redisInstance) {
    try {
      redisInstance = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!.trim(),
        token: process.env.UPSTASH_REDIS_REST_TOKEN!.trim(),
      });
    } catch (err) {
      console.warn('[REDIS_INIT_FAILED] Gagal inisialisasi client Upstash Redis:', err);
      return null;
    }
  }

  return redisInstance;
}

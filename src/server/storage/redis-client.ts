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

/**
 * Actively checks Redis connectivity with a lightweight ping and latency measurement.
 */
export async function checkRedisHealth(): Promise<{
  configured: boolean;
  connected: boolean;
  latencyMs: number | null;
}> {
  if (!isUpstashConfigured()) {
    return {
      configured: false,
      connected: false,
      latencyMs: null,
    };
  }

  const client = getRedisClient();
  if (!client) {
    return {
      configured: true,
      connected: false,
      latencyMs: null,
    };
  }

  const start = Date.now();
  try {
    const pingPromise = client.ping();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Redis ping timeout')), 2000)
    );

    const res = await Promise.race([pingPromise, timeoutPromise]);
    const latencyMs = Date.now() - start;
    const isConnected = res === 'PONG' || res === 'pong' || Boolean(res);

    return {
      configured: true,
      connected: isConnected,
      latencyMs: isConnected ? latencyMs : null,
    };
  } catch {
    return {
      configured: true,
      connected: false,
      latencyMs: null,
    };
  }
}


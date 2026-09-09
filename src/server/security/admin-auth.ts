import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getRedisClient, isUpstashConfigured } from '../storage/redis-client';
import { getRateLimiter } from './rate-limiter';
import { getClientIp } from './client-ip';

export const ADMIN_COOKIE_NAME = 'admin_auth_token';
export const ADMIN_SESSION_TTL_SECONDS = 3600; // 1 hour

export interface AdminSessionInfo {
  token: string;
  tokenPreview: string;
  loginAt: number;
  ip: string;
  userAgent: string;
  isCurrent: boolean;
}

// In-memory fallback for admin sessions if Upstash Redis is not configured
interface MemorySession {
  expiresAt: number;
  loginAt: number;
  ip: string;
  userAgent: string;
}
const inMemoryAdminSessions = new Map<string, MemorySession>();

function cleanupMemorySessions() {
  const now = Date.now();
  for (const [token, session] of inMemoryAdminSessions.entries()) {
    if (session.expiresAt <= now) {
      inMemoryAdminSessions.delete(token);
    }
  }
}

// In-memory cache for hashed ADMIN_SECRET_KEY so we don't re-hash on every request
let cachedAdminSecretKey: string | null = null;
let cachedAdminSecretHash: string | null = null;

/**
 * Validates and retrieves the admin configuration.
 * If either ADMIN_SECRET_KEY or ADMIN_PANEL_PATH is missing/invalid, admin panel is completely disabled.
 */
export function getAdminConfig(): {
  enabled: boolean;
  panelPath: string;
  secretKey: string;
} {
  const rawSecret = process.env.ADMIN_SECRET_KEY?.trim() || '';
  const rawPath = process.env.ADMIN_PANEL_PATH?.trim() || (rawSecret.length >= 16 ? 'superadmin' : '');

  // Clean path: strip leading and trailing slashes
  const cleanPath = rawPath.replace(/^\/+|\/+$/g, '');

  // Strict security: require non-empty path and minimum 16 characters for the secret (passphrase)
  const isPathValid = cleanPath.length >= 3 && !cleanPath.includes('..') && !cleanPath.includes(' ');
  const isSecretValid = rawSecret.length >= 16;

  if (!isPathValid || !isSecretValid) {
    return {
      enabled: false,
      panelPath: '',
      secretKey: '',
    };
  }

  return {
    enabled: true,
    panelPath: cleanPath,
    secretKey: rawSecret,
  };
}

/**
 * Hashes a plaintext password using bcrypt with cost factor 12.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

/**
 * Verifies a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Verifies the submitted admin password against the configured ADMIN_SECRET_KEY
 * using bcrypt hashing rather than plaintext comparison.
 */
export async function verifyAdminPassword(inputPassword: string): Promise<boolean> {
  const { enabled, secretKey } = getAdminConfig();
  if (!enabled || !secretKey || !inputPassword) {
    return false;
  }

  // Generate or reuse bcrypt hash of the secret key
  if (!cachedAdminSecretHash || cachedAdminSecretKey !== secretKey) {
    cachedAdminSecretHash = await hashPassword(secretKey);
    cachedAdminSecretKey = secretKey;
  }

  return verifyPassword(inputPassword, cachedAdminSecretHash);
}

/**
 * Creates a cryptographically random admin session token with 1-hour TTL.
 */
export async function createAdminSession(req?: Request): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const clientIp = req ? getClientIp(req) : '127.0.0.1';
  const userAgent = (req?.headers['user-agent'] as string) || 'Unknown Client';

  const redis = isUpstashConfigured() ? getRedisClient() : null;

  if (redis) {
    try {
      const pipeline = redis.pipeline();
      pipeline.set(`admin_session:${token}`, 'valid', { ex: ADMIN_SESSION_TTL_SECONDS });
      pipeline.set(
        `admin_session_meta:${token}`,
        JSON.stringify({ token, loginAt: now, ip: clientIp, userAgent }),
        { ex: ADMIN_SESSION_TTL_SECONDS }
      );
      pipeline.sadd('admin_active_sessions', token);
      await pipeline.exec();
      return token;
    } catch (err) {
      console.warn('[ADMIN_SESSION_REDIS_ERROR] Gagal menyimpan sesi admin di Redis, fallback memory:', err);
    }
  }

  cleanupMemorySessions();
  inMemoryAdminSessions.set(token, {
    expiresAt: now + ADMIN_SESSION_TTL_SECONDS * 1000,
    loginAt: now,
    ip: clientIp,
    userAgent,
  });

  return token;
}

/**
 * Validates whether an admin session token is active and not expired.
 */
export async function verifyAdminSession(token: string): Promise<boolean> {
  if (!token || typeof token !== 'string' || token.length < 32) {
    return false;
  }

  const redis = isUpstashConfigured() ? getRedisClient() : null;

  if (redis) {
    try {
      const val = await redis.get<string>(`admin_session:${token}`);
      return val === 'valid';
    } catch (err) {
      console.warn('[ADMIN_SESSION_REDIS_ERROR] Gagal memverifikasi sesi admin di Redis, fallback memory:', err);
    }
  }

  cleanupMemorySessions();
  const session = inMemoryAdminSessions.get(token);
  if (!session) return false;
  if (session.expiresAt <= Date.now()) {
    inMemoryAdminSessions.delete(token);
    return false;
  }

  return true;
}

/**
 * Destroys an active admin session token immediately.
 */
export async function destroyAdminSession(token: string): Promise<void> {
  if (!token) return;

  const redis = isUpstashConfigured() ? getRedisClient() : null;

  if (redis) {
    try {
      const pipeline = redis.pipeline();
      pipeline.del(`admin_session:${token}`);
      pipeline.del(`admin_session_meta:${token}`);
      pipeline.srem('admin_active_sessions', token);
      await pipeline.exec();
    } catch (err) {
      console.warn('[ADMIN_SESSION_REDIS_ERROR] Gagal menghapus sesi admin dari Redis:', err);
    }
  }

  inMemoryAdminSessions.delete(token);
}

/**
 * Retrieves list of all currently active admin sessions with masked tokens and client metadata.
 */
export async function getAllActiveSessions(currentToken?: string): Promise<AdminSessionInfo[]> {
  const sessions: AdminSessionInfo[] = [];
  const now = Date.now();
  const redis = isUpstashConfigured() ? getRedisClient() : null;

  if (redis) {
    try {
      const rawTokens = await redis.smembers('admin_active_sessions');
      if (Array.isArray(rawTokens) && rawTokens.length > 0) {
        const tokensToPurge: string[] = [];

        for (const t of rawTokens) {
          if (typeof t !== 'string') continue;
          const status = await redis.get<string>(`admin_session:${t}`);
          if (status !== 'valid') {
            tokensToPurge.push(t);
            continue;
          }

          const rawMeta = await redis.get<string | { token: string; loginAt: number; ip: string; userAgent: string }>(
            `admin_session_meta:${t}`
          );
          let meta = { token: t, loginAt: now, ip: '127.0.0.1', userAgent: 'Browser Client' };
          if (rawMeta) {
            meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
          }

          sessions.push({
            token: t,
            tokenPreview: `${t.substring(0, 8)}...`,
            loginAt: meta.loginAt || now,
            ip: meta.ip || '127.0.0.1',
            userAgent: meta.userAgent || 'Browser Client',
            isCurrent: Boolean(currentToken && currentToken === t),
          });
        }

        // Clean up expired tokens from Redis set in batch
        if (tokensToPurge.length > 0) {
          const pipeline = redis.pipeline();
          for (const deadToken of tokensToPurge) {
            pipeline.srem('admin_active_sessions', deadToken);
            pipeline.del(`admin_session:${deadToken}`);
            pipeline.del(`admin_session_meta:${deadToken}`);
          }
          await pipeline.exec();
        }

        // Return sorted newest first
        return sessions.sort((a, b) => b.loginAt - a.loginAt);
      }
    } catch (err) {
      console.warn('[ADMIN_ACTIVE_SESSIONS] Gagal membaca sesi dari Redis, fallback memory:', err);
    }
  }

  // In-memory fallback
  cleanupMemorySessions();
  for (const [t, s] of inMemoryAdminSessions.entries()) {
    sessions.push({
      token: t,
      tokenPreview: `${t.substring(0, 8)}...`,
      loginAt: s.loginAt || now,
      ip: s.ip || '127.0.0.1',
      userAgent: s.userAgent || 'Browser Client',
      isCurrent: Boolean(currentToken && currentToken === t),
    });
  }

  return sessions.sort((a, b) => b.loginAt - a.loginAt);
}

/**
 * Revokes a specific admin session.
 */
export async function revokeAdminSession(token: string): Promise<boolean> {
  if (!token || typeof token !== 'string') return false;
  await destroyAdminSession(token);
  return true;
}

/**
 * Revokes all admin sessions, optionally preserving the current active token.
 */
export async function revokeAllAdminSessions(preserveToken?: string): Promise<number> {
  const allSessions = await getAllActiveSessions();
  let revokedCount = 0;

  for (const session of allSessions) {
    if (preserveToken && session.token === preserveToken) {
      continue;
    }
    await destroyAdminSession(session.token);
    revokedCount++;
  }

  return revokedCount;
}

/**
 * Rate limiter middleware specifically for admin login:
 * Maximum 5 attempts per 15 minutes per client IP.
 */
export async function checkAdminLoginRateLimit(
  req: Request
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const limiter = getRateLimiter();
  const clientIp = getClientIp(req);
  const key = `admin_login:${clientIp}`;
  const limit = 5;
  const windowMs = 15 * 60 * 1000; // 15 minutes

  const result = await limiter.check(key, limit, windowMs);
  const retryAfterSeconds = Math.max(1, Math.ceil((result.resetTimeMs - Date.now()) / 1000));

  return {
    allowed: result.allowed,
    retryAfterSeconds,
  };
}

/**
 * Middleware that strictly protects admin routes.
 * If unauthenticated: redirects browser requests to login or returns 401 for API requests.
 */
export async function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { enabled, panelPath } = getAdminConfig();

  // If admin panel is disabled in environment, return 404 identical to non-existent routes
  if (!enabled) {
    res.status(404).send('<!DOCTYPE html><html><body>404 Not Found</body></html>');
    return;
  }

  // Enforce security response headers for all admin responses
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');

  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  const isValid = token ? await verifyAdminSession(token) : false;

  if (!isValid) {
    const isApiRequest = req.path.includes('/api/') || req.xhr || req.headers.accept?.includes('application/json');
    if (!isApiRequest && req.accepts('html')) {
      res.redirect(`/${panelPath}/login`);
      return;
    }

    res.status(401).json({
      success: false,
      error: {
        code: 'ADMIN_UNAUTHORIZED',
        message: 'Akses ditolak. Sesi admin diperlukan.',
      },
    });
    return;
  }

  next();
}

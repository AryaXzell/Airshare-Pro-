import { Request } from 'express';

/**
 * Safely extracts client IP address, trusting ONLY headers that cannot be
 * spoofed by the client on this deployment platform (Vercel).
 */
export function getClientIp(req: Request): string {
  // 1. Vercel-specific forwarded IP header (authoritative on Vercel deployment;
  // Vercel's edge network strips/overwrites this header if a client attempts
  // to send it directly, making it safe to trust unconditionally on Vercel).
  const vercelIp = req.headers['x-vercel-forwarded-for'];
  if (typeof vercelIp === 'string' && vercelIp.trim()) {
    return vercelIp.split(',')[0].trim();
  }

  // 2. Not on Vercel — rely on Express's own trust proxy resolution (req.ip)
  // rather than reading x-forwarded-for directly from raw headers.
  if (req.ip && req.ip !== '::1' && req.ip !== '127.0.0.1') {
    return req.ip;
  }

  // 3. Direct socket address fallback (most trustworthy when no proxy involved).
  return req.socket?.remoteAddress || 'unknown-ip';
}

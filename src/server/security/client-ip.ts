import { Request } from 'express';

/**
 * Safely extracts client IP address with priority for Vercel/reverse proxy trusted headers.
 */
export function getClientIp(req: Request): string {
  // 1. Vercel-specific forwarded IP header (authoritative on Vercel deployment)
  const vercelIp = req.headers['x-vercel-forwarded-for'];
  if (typeof vercelIp === 'string' && vercelIp.trim()) {
    return vercelIp.split(',')[0].trim();
  }

  // 2. Standard X-Forwarded-For header (first address is client)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  // 3. Express req.ip (from trust proxy)
  if (req.ip) {
    return req.ip;
  }

  // 4. Direct socket address fallback
  return req.socket?.remoteAddress || 'unknown-ip';
}

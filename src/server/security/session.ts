import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export const SESSION_COOKIE_NAME = 'airshare_session';

// Augment Express Request interface with sessionId
declare global {
  namespace Express {
    interface Request {
      sessionId: string;
    }
  }
}

/**
 * Validates whether a given string is a safe UUID / Session ID format.
 */
export function isValidSessionId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[a-zA-Z0-9_-]{16,64}$/.test(id);
}

/**
 * Middleware that ensures every visitor has a secure, scoped session ID.
 * The session ID is stored in an httpOnly, Secure, SameSite=Strict cookie.
 */
export function sessionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingCookie = req.cookies?.[SESSION_COOKIE_NAME];
  let sessionId = existingCookie;

  if (!sessionId || !isValidSessionId(sessionId)) {
    sessionId = `sess_${crypto.randomBytes(16).toString('hex')}`;
    const isProd = process.env.NODE_ENV === 'production';

    res.cookie(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year persistence
      path: '/',
    });
  }

  req.sessionId = sessionId;
  next();
}

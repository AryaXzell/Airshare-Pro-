import { Request, Response } from 'express';
import {
  ADMIN_COOKIE_NAME,
  checkAdminLoginRateLimit,
  createAdminSession,
  destroyAdminSession,
  getAdminConfig,
  verifyAdminPassword,
  verifyAdminSession,
} from '../security/admin-auth';
import { auditLogRepository } from '../repository/audit-log-repository';
import { getClientIp } from '../security/client-ip';
import { alertAdminLoginFailed } from '../telegram/telegram-notifier';
import { renderAdminLoginHtml } from '../admin-html/pages/login-page';

export async function renderLoginPage(req: Request, res: Response): Promise<void> {
  try {
    const { enabled, panelPath: fullAdminPath } = getAdminConfig();
    if (!enabled) {
      res.status(404).send('<!DOCTYPE html><html><body>404 Not Found</body></html>');
      return;
    }

    // Check if already authenticated
    const token = req.cookies?.[ADMIN_COOKIE_NAME];
    if (token && (await verifyAdminSession(token))) {
      res.redirect(`/${fullAdminPath}/dashboard`);
      return;
    }

    const errorParam = req.query.error as string;
    const retryAfter = req.query.retryAfter as string;

    let errorMessage = '';
    if (errorParam === 'invalid') {
      errorMessage = 'Kredensial tidak valid. Silakan coba kembali.';
    } else if (errorParam === 'rate_limited') {
      errorMessage = `Terlalu banyak percobaan login gagal. Silakan tunggu ${
        retryAfter ? `${retryAfter} detik` : 'beberapa saat'
      } sebelum mencoba kembali.`;
    }

    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    const html = renderAdminLoginHtml({
      fullAdminPath,
      errorMessage,
    });

    res.status(200).send(html);
  } catch (err: any) {
    console.error('[ADMIN_RENDER_LOGIN_ERROR]', err);
    res.status(500).send('<!DOCTYPE html><html><body><h1>500 Internal Server Error</h1><p>Gagal memuat halaman login admin.</p></body></html>');
  }
}

export async function handleLogin(req: Request, res: Response): Promise<void> {
  const { enabled, panelPath: fullAdminPath } = getAdminConfig();
  if (!enabled) {
    res.status(404).send('<!DOCTYPE html><html><body>404 Not Found</body></html>');
    return;
  }

  try {
    const clientIp = getClientIp(req);

    // 1. Strict rate limit check (5 attempts per 15 mins per IP)
    const rateLimit = await checkAdminLoginRateLimit(req);
    if (!rateLimit.allowed) {
      console.warn(`[ADMIN_LOGIN_RATE_LIMITED] IP ${clientIp} exceeded login attempts`);
      await auditLogRepository.recordAction({
        type: 'ADMIN_LOGIN_RATE_LIMITED',
        detail: `IP ${clientIp} terkena batasan rate limit login admin`,
        ip: clientIp,
      });
      alertAdminLoginFailed(clientIp).catch((alertErr) => {
        console.warn('[TELEGRAM_ALERT_WARN] Gagal mengirim alert login admin gagal:', alertErr);
      });
      res.redirect(`/${fullAdminPath}/login?error=rate_limited&retryAfter=${rateLimit.retryAfterSeconds}`);
      return;
    }

    const password = req.body?.password;
    if (!password || typeof password !== 'string') {
      res.redirect(`/${fullAdminPath}/login?error=invalid`);
      return;
    }

    // 2. Verify password with bcrypt hashing
    const isValid = await verifyAdminPassword(password);
    if (!isValid) {
      console.warn(`[ADMIN_LOGIN_FAILED] Percobaan login admin gagal pada ${new Date().toISOString()}`);
      await auditLogRepository.recordAction({
        type: 'ADMIN_LOGIN_FAILED',
        detail: 'Percobaan login admin gagal dengan sandi tidak valid',
        ip: clientIp,
      });
      res.redirect(`/${fullAdminPath}/login?error=invalid`);
      return;
    }

    // 3. Create fresh admin session token with 1-hour TTL
    const sessionToken = await createAdminSession(req);
    console.info(`[ADMIN_LOGIN_SUCCESS] Sesi admin berhasil dibuat pada ${new Date().toISOString()}`);
    await auditLogRepository.recordAction({
      type: 'ADMIN_LOGIN',
      detail: 'Login berhasil ke panel kontrol admin',
      ip: clientIp,
      adminTokenPreview: `${sessionToken.substring(0, 8)}...`,
    });

    // 4. Set HttpOnly secure cookie
    res.cookie(ADMIN_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600 * 1000, // 1 hour
      path: '/',
    });

    res.redirect(`/${fullAdminPath}/dashboard`);
  } catch (err: unknown) {
    console.error('[HANDLE_LOGIN_ERROR]', err);
    res.redirect(`/${fullAdminPath}/login?error=invalid`);
  }
}

export async function handleLogout(req: Request, res: Response): Promise<void> {
  const { enabled, panelPath: fullAdminPath } = getAdminConfig();
  if (!enabled) {
    res.status(404).send('<!DOCTYPE html><html><body>404 Not Found</body></html>');
    return;
  }

  try {
    const clientIp = getClientIp(req);
    const token = req.cookies?.[ADMIN_COOKIE_NAME];
    if (token) {
      await destroyAdminSession(token);
    }

    await auditLogRepository.recordAction({
      type: 'ADMIN_LOGOUT',
      detail: 'Admin keluar dari sesi',
      ip: clientIp,
      adminTokenPreview: token ? `${token.substring(0, 8)}...` : undefined,
    });

    res.clearCookie(ADMIN_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });
    res.redirect(`/${fullAdminPath}/login`);
  } catch (err: unknown) {
    console.error('[HANDLE_LOGOUT_ERROR]', err);
    res.clearCookie(ADMIN_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });
    res.redirect(`/${fullAdminPath}/login`);
  }
}

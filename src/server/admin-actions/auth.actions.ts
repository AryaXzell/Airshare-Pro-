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

    // Support programmatic testing (e.g. Vercel routing tests) by returning a standard 302 redirect
    // when requested via JSON. Otherwise, serve the rich transitional HTML page with retry/mitigation logic.
    if (req.headers['content-type']?.includes('json') || req.headers['accept']?.includes('json')) {
      res.redirect(`/${fullAdminPath}/dashboard`);
      return;
    }

    res.status(200).send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Mengalihkan...</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0e0e11; color: #f4f4f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .loader { text-align: center; }
    .spinner { width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.15); border-top-color: #34d399; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { font-size: 0.85rem; color: #94949b; }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <p id="status-text">Memuat dashboard...</p>
  </div>
  <script>
    (function() {
      const targetUrl = '/${fullAdminPath}/dashboard';
      const statusText = document.getElementById('status-text');
      const maxAttempts = 4;
      const retryDelaysMs = [300, 800, 1500, 3000];

      async function attemptNavigation(attempt) {
        try {
          const res = await fetch(targetUrl, { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
          if (res.ok) {
            window.location.replace(targetUrl);
            return;
          }
          throw new Error('Status ' + res.status);
        } catch (err) {
          if (attempt < maxAttempts) {
            statusText.textContent = 'Menghubungkan ke server (percobaan ' + (attempt + 1) + ')...';
            setTimeout(function() { attemptNavigation(attempt + 1); }, retryDelaysMs[attempt] || 3000);
          } else {
            statusText.textContent = 'Gagal memuat dashboard setelah beberapa percobaan. Mengalihkan langsung...';
            setTimeout(function() { window.location.href = targetUrl; }, 1000);
          }
        }
      }

      attemptNavigation(0);
    })();
  </script>
</body>
</html>`);
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

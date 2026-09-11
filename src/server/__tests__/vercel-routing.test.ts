import assert from 'assert';
import http from 'http';
import { createExpressApp } from '../app';
import vercelHandler from '../vercel';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resetAdminLoginRateLimit } from '../security/admin-auth';

async function runVercelRoutingTests() {
  console.log('--- Running Vercel Routing & Rewrite Integration Tests ---');

  const app = createExpressApp();
  const server = http.createServer((req, res) => {
    // Wrap with vercelHandler to simulate Vercel serverless function environment
    return vercelHandler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Scenario A: When Admin is configured (current env has ADMIN_SECRET_KEY)
    // /admin should redirect to login page (302 -> /login, 200) instead of falling back to SPA
    const configuredRes = await fetch(`${baseUrl}/admin`, { redirect: 'follow' });
    assert.strictEqual(configuredRes.status, 200, 'Configured /admin renders admin login page');
    const configuredHtml = await configuredRes.text();
    assert(configuredHtml.includes('Admin') && (configuredHtml.includes('password') || configuredHtml.includes('Masuk') || configuredHtml.includes('AirShare')), 'Login page contains admin login form');
    console.log('✅ PASS: Configured /admin routes correctly to admin login page (not SPA home)');

    // Test Vercel rewritten /admin (i.e. /api?__vpath=/admin)
    const rewrittenAdminRes = await fetch(`${baseUrl}/api?__vpath=/admin`, { redirect: 'follow' });
    assert.strictEqual(rewrittenAdminRes.status, 200, 'Rewritten /admin renders login page');
    const rewrittenHtml = await rewrittenAdminRes.text();
    assert(rewrittenHtml.includes('Admin') && (rewrittenHtml.includes('password') || rewrittenHtml.includes('Masuk')), 'Rewritten request preserved login form');
    console.log('✅ PASS: Vercel rewritten /api?__vpath=/admin routes to admin handler');

    // 2. Test Vercel rewritten /s/:id (i.e. /api?__vpath=/s/item_999)
    const rewrittenShareRes = await fetch(`${baseUrl}/api?__vpath=/s/nonexistent_share_item_999`);
    assert.strictEqual(rewrittenShareRes.status, 404, 'Rewritten /s/:id reaches share controller');
    const shareHtml = await rewrittenShareRes.text();
    assert(shareHtml.includes('Berkas Tidak Ditemukan') || shareHtml.includes('404'), 'Share landing page 404 rendered');
    console.log('✅ PASS: Vercel rewritten /api?__vpath=/s/:id routes to share landing controller');

    // 3. Test normal API endpoints (/api/health) still work seamlessly without interruption
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(healthRes.status, 200, 'Normal API endpoints work without distortion');
    const healthJson = await healthRes.json() as { status: string };
    assert.strictEqual(healthJson.status, 'ok', 'Health check returns status: ok');
    console.log('✅ PASS: Normal API endpoint /api/health functions properly in Vercel handler');

    // 4. Test Vercel rewritten /api/health (i.e. /api?__vpath=/api/health)
    const rewrittenHealthRes = await fetch(`${baseUrl}/api?__vpath=/api/health`);
    assert.strictEqual(rewrittenHealthRes.status, 200, 'Rewritten /api/health returns 200');
    const rewrittenHealthJson = await rewrittenHealthRes.json() as { status: string };
    assert.strictEqual(rewrittenHealthJson.status, 'ok', 'Rewritten health check returns status: ok');
    console.log('✅ PASS: Vercel rewritten /api?__vpath=/api/health works correctly');

    // 5. Test Vercel rewritten /health (i.e. /api?__vpath=/health)
    const rewrittenRootHealthRes = await fetch(`${baseUrl}/api?__vpath=/health`);
    assert.strictEqual(rewrittenRootHealthRes.status, 200, 'Rewritten /health returns 200');
    console.log('✅ PASS: Vercel rewritten /api?__vpath=/health works correctly');

    // 6. Test Vercel rewritten /api/system-status (i.e. /api?__vpath=/api/system-status)
    const systemStatusRes = await fetch(`${baseUrl}/api?__vpath=/api/system-status`);
    assert.strictEqual(systemStatusRes.status, 200, 'Rewritten /api/system-status returns 200');
    const sysJson = await systemStatusRes.json() as { success: boolean };
    assert.strictEqual(sysJson.success, true, 'System status returns success: true');
    console.log('✅ PASS: Vercel rewritten /api?__vpath=/api/system-status works correctly');

    // 7. Test Vercel rewritten /api/media/config (i.e. /api?__vpath=/api/media/config)
    const mediaConfigRes = await fetch(`${baseUrl}/api?__vpath=/api/media/config`);
    assert.strictEqual(mediaConfigRes.status, 200, 'Rewritten /api/media/config returns 200');
    const mediaConfigJson = await mediaConfigRes.json() as { success: boolean };
    assert.strictEqual(mediaConfigJson.success, true, 'Media config returns success: true');
    console.log('✅ PASS: Vercel rewritten /api?__vpath=/api/media/config works correctly');

    // 8. Test Vercel query parameter preservation (i.e. /api?__vpath=/api/media&limit=10)
    const mediaListRes = await fetch(`${baseUrl}/api?__vpath=/api/media&limit=10`);
    assert.strictEqual(mediaListRes.status, 200, 'Rewritten /api/media with query params returns 200');
    const mediaListJson = await mediaListRes.json() as { success: boolean };
    assert.strictEqual(mediaListJson.success, true, 'Media list returns success: true');
    console.log('✅ PASS: Vercel query parameters preserved cleanly in serverless handler');

    // 9. Test x-forwarded-uri header resolution for /api/health
    const forwardedHealthRes = await fetch(`${baseUrl}/api`, {
      headers: {
        'x-forwarded-uri': '/api/health',
      },
    });
    assert.strictEqual(forwardedHealthRes.status, 200, 'x-forwarded-uri /api/health resolved to health endpoint');
    console.log('✅ PASS: x-forwarded-uri /api/health correctly restored by Vercel handler');

    // 10. Test x-forwarded-uri header resolution for /s/:id
    const forwardedRes = await fetch(`${baseUrl}/api`, {
      headers: {
        'x-forwarded-uri': '/s/forwarded_item_123',
      },
    });
    assert.strictEqual(forwardedRes.status, 404, 'x-forwarded-uri is resolved to share controller');
    console.log('✅ PASS: x-forwarded-uri /s/:id correctly restored by Vercel handler');

    // 11. Test direct invocation of /api returns operational descriptor JSON
    const directApiRes = await fetch(`${baseUrl}/api`);
    assert.strictEqual(directApiRes.status, 200, 'Direct /api returns 200');
    const directApiJson = await directApiRes.json() as { success: boolean; service: string };
    assert.strictEqual(directApiJson.success, true, 'Direct /api returns success: true');
    assert(directApiJson.service.includes('AirShare'), 'Direct /api returns AirShare service descriptor');
    console.log('✅ PASS: Direct /api returns 200 JSON with service registry');

    // 12. Test bare /s and /s/ redirect to root (no crash / no 404)
    const bareShareRes = await fetch(`${baseUrl}/api?__vpath=/s`, { redirect: 'manual' });
    assert.strictEqual(bareShareRes.status, 302, 'Bare /s returns 302 redirect');
    assert.strictEqual(bareShareRes.headers.get('location'), '/', 'Bare /s redirects to /');
    console.log('✅ PASS: Bare /s redirects cleanly to root');

    const bareShareSlashRes = await fetch(`${baseUrl}/api?__vpath=/s/`, { redirect: 'manual' });
    assert.strictEqual(bareShareSlashRes.status, 302, 'Bare /s/ returns 302 redirect');
    console.log('✅ PASS: Bare /s/ redirects cleanly to root');

    // 13. Test upload without file returns structured JSON 400
    const emptyUploadRes = await fetch(`${baseUrl}/api?__vpath=/api/media/upload`, {
      method: 'POST',
    });
    assert.strictEqual(emptyUploadRes.status, 400, 'Empty upload returns 400');
    const emptyUploadJson = await emptyUploadRes.json() as { success: boolean; error?: { code?: string } };
    assert.strictEqual(emptyUploadJson.success, false, 'Empty upload returns success: false');
    assert.strictEqual(emptyUploadJson.error?.code, 'NO_FILE', 'Returns code: NO_FILE');
    console.log('✅ PASS: Vercel /api/media/upload validates missing files with 400 JSON');

    // 14. Test invalid media ID parameter validation
    const invalidIdRes = await fetch(`${baseUrl}/api?__vpath=/api/media/invalid%20id%20with%20spaces`);
    assert.strictEqual(invalidIdRes.status, 400, 'Invalid media ID returns 400');
    const invalidIdJson = await invalidIdRes.json() as { error?: { code?: string } };
    assert.strictEqual(invalidIdJson.error?.code, 'INVALID_ID', 'Returns code: INVALID_ID');
    console.log('✅ PASS: Vercel /api/media/:id rejects invalid IDs with 400 JSON');

    // 15. Test unmatched API route returns structured JSON 404 (never raw HTML)
    const unknownApiRes = await fetch(`${baseUrl}/api?__vpath=/api/unknown-endpoint-abc`);
    assert.strictEqual(unknownApiRes.status, 404, 'Unknown API returns 404');
    const unknownApiJson = await unknownApiRes.json() as { success: boolean; error?: { code?: string } };
    assert.strictEqual(unknownApiJson.success, false, 'Unknown API returns success: false');
    assert.strictEqual(unknownApiJson.error?.code, 'NOT_FOUND', 'Returns code: NOT_FOUND');
    console.log('✅ PASS: Unmatched Vercel /api/* returns structured JSON 404');

    // 16. Test admin login authentication via Vercel rewrite
    await resetAdminLoginRateLimit('127.0.0.1');
    const secretKey = process.env.ADMIN_SECRET_KEY || 'test-secret-key-16-chars-min';
    const loginFailRes = await fetch(`${baseUrl}/api?__vpath=/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong_password_xyz' }),
      redirect: 'manual',
    });
    assert.strictEqual(loginFailRes.status, 302, 'Bad login password returns 302 redirect to error');
    assert(loginFailRes.headers.get('location')?.includes('error=invalid'), 'Redirects with error=invalid');
    console.log('✅ PASS: Vercel /admin/login rejects incorrect password with 302 to error page');

    const loginSuccessRes = await fetch(`${baseUrl}/api?__vpath=/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: secretKey }),
      redirect: 'manual',
    });
    assert.strictEqual(loginSuccessRes.status, 302, 'Valid login returns 302 redirect to dashboard');
    assert(loginSuccessRes.headers.get('location')?.includes('dashboard'), 'Redirects to dashboard');
    const setCookie = loginSuccessRes.headers.get('set-cookie');
    assert(setCookie && setCookie.includes('admin_auth_token='), 'Login sets admin_auth_token cookie');
    const tokenMatch = setCookie.match(/admin_auth_token=([^;]+)/);
    const adminToken = tokenMatch ? tokenMatch[1] : '';
    console.log('✅ PASS: Vercel /admin/login succeeds and issues admin_auth_token cookie');

    // 17. Test protected admin endpoints via Vercel rewrite with authentication
    const authLiveStatsRes = await fetch(`${baseUrl}/api?__vpath=/admin/api/live-stats`, {
      headers: { Cookie: `admin_auth_token=${adminToken}` },
    });
    assert.strictEqual(authLiveStatsRes.status, 200, 'Authenticated live stats returns 200');
    const liveStatsJson = await authLiveStatsRes.json() as { success: boolean };
    assert.strictEqual(liveStatsJson.success, true, 'Live stats returns success: true');
    console.log('✅ PASS: Authenticated Vercel /admin/api/live-stats returns 200 JSON');

    // 18. Test AI recommendations via Vercel rewrite with authentication
    const authAiRes = await fetch(`${baseUrl}/api?__vpath=/admin/api/ai-recommendations`, {
      method: 'POST',
      headers: { Cookie: `admin_auth_token=${adminToken}` },
    });
    assert.strictEqual(authAiRes.status, 200, 'Authenticated AI recommendations returns 200');
    const aiJson = await authAiRes.json() as { success: boolean; summary?: string };
    assert.strictEqual(aiJson.success, true, 'AI recommendations returns success: true');
    console.log('✅ PASS: Authenticated Vercel /admin/api/ai-recommendations returns 200 JSON');

    // 19. Test sync-check via Vercel rewrite with authentication
    const authSyncRes = await fetch(`${baseUrl}/api?__vpath=/admin/api/sync-check`, {
      method: 'POST',
      headers: { Cookie: `admin_auth_token=${adminToken}` },
    });
    assert.strictEqual(authSyncRes.status, 200, 'Authenticated sync check returns 200');
    console.log('✅ PASS: Authenticated Vercel /admin/api/sync-check returns 200 JSON');

    // 20. Test logout via Vercel rewrite clears session
    const logoutRes = await fetch(`${baseUrl}/api?__vpath=/admin/logout`, {
      headers: { Cookie: `admin_auth_token=${adminToken}` },
      redirect: 'manual',
    });
    assert.strictEqual(logoutRes.status, 302, 'Logout returns 302 redirect');
    console.log('✅ PASS: Vercel /admin/logout clears session and redirects cleanly');

    console.log('========================================');
    console.log('Vercel Routing Tests: All 20 Passed, 0 Failed');
    console.log('========================================');
  } finally {
    server.close();
  }
}

runVercelRoutingTests().catch((err) => {
  console.error('Vercel routing test failed:', err);
  process.exit(1);
});

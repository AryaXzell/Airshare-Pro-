import assert from 'assert';
import http from 'http';
import { createExpressApp } from '../app';
import vercelHandler from '../vercel';
import type { VercelRequest, VercelResponse } from '@vercel/node';

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
    // /superadmin should redirect to login page (302 -> /login, 200) instead of falling back to SPA
    const configuredRes = await fetch(`${baseUrl}/superadmin`, { redirect: 'follow' });
    assert.strictEqual(configuredRes.status, 200, 'Configured /superadmin renders admin login page');
    const configuredHtml = await configuredRes.text();
    assert(configuredHtml.includes('Admin') && (configuredHtml.includes('password') || configuredHtml.includes('Masuk') || configuredHtml.includes('AirShare')), 'Login page contains admin login form');
    console.log('✅ PASS: Configured /superadmin routes correctly to admin login page (not SPA home)');

    // Test Vercel rewritten /superadmin (i.e. /api?__vpath=/superadmin)
    const rewrittenSuperadminRes = await fetch(`${baseUrl}/api?__vpath=/superadmin`, { redirect: 'follow' });
    assert.strictEqual(rewrittenSuperadminRes.status, 200, 'Rewritten /superadmin renders login page');
    const rewrittenHtml = await rewrittenSuperadminRes.text();
    assert(rewrittenHtml.includes('Admin') && (rewrittenHtml.includes('password') || rewrittenHtml.includes('Masuk')), 'Rewritten request preserved login form');
    console.log('✅ PASS: Vercel rewritten /api?__vpath=/superadmin routes to admin handler');

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

    // 4. Test x-forwarded-uri header resolution
    const forwardedRes = await fetch(`${baseUrl}/api`, {
      headers: {
        'x-forwarded-uri': '/s/forwarded_item_123',
      },
    });
    assert.strictEqual(forwardedRes.status, 404, 'x-forwarded-uri is resolved to share controller');
    console.log('✅ PASS: x-forwarded-uri header correctly restored by Vercel handler');

    console.log('========================================');
    console.log('Vercel Routing Tests: All 5 Passed, 0 Failed');
    console.log('========================================');
  } finally {
    server.close();
  }
}

runVercelRoutingTests().catch((err) => {
  console.error('Vercel routing test failed:', err);
  process.exit(1);
});

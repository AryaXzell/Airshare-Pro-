import {
  getAdminConfig,
  hashPassword,
  verifyPassword,
  verifyAdminPassword,
  createAdminSession,
  verifyAdminSession,
  destroyAdminSession,
} from '../security/admin-auth';
import {
  analyticsRepository,
  getTodayDateString,
} from '../repository/analytics-repository';
import { generateRecommendations } from '../api/admin-controller';
import { DailyStats, MediaObject, WeeklyTrendItem } from '../../types';

async function runAdminTests() {
  console.log('--- Running AirShare Pro Hidden Admin & Analytics Tests ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // 1. Password Hashing with Bcrypt
  const samplePassword = 'my-super-secret-admin-passphrase-2026';
  const hashed = await hashPassword(samplePassword);
  assert(hashed.startsWith('$2'), 'Bcrypt hash starts with $2 prefix');
  assert(hashed !== samplePassword, 'Hash is completely distinct from plaintext password');

  const matchCorrect = await verifyPassword(samplePassword, hashed);
  assert(matchCorrect === true, 'verifyPassword returns true for correct plaintext');

  const matchWrong = await verifyPassword('wrong-password', hashed);
  assert(matchWrong === false, 'verifyPassword returns false for invalid plaintext');

  // 2. Admin Config Validation & Activation Gate
  // Without env vars set
  const origSecret = process.env.ADMIN_SECRET_KEY;

  delete process.env.ADMIN_SECRET_KEY;
  let config = getAdminConfig();
  assert(config.enabled === false, 'Admin panel disabled when ADMIN_SECRET_KEY is missing');
  assert(config.panelPath === 'admin', 'panelPath is always fixed to "admin"');

  // Secret too short (<16 chars)
  process.env.ADMIN_SECRET_KEY = 'too-short';
  config = getAdminConfig();
  assert(config.enabled === false, 'Admin panel disabled when ADMIN_SECRET_KEY < 16 chars');
  assert(config.panelPath === 'admin', 'panelPath remains "admin" even when disabled');

  // Valid config (16+ chars secret) - ADMIN_PANEL_PATH env is completely ignored
  const validSecret = 'kunci-rahasia-admin-airshare-pro-2026!';
  (process.env as Record<string, string | undefined>).ADMIN_PANEL_PATH = 'custom-987x-vault-ignored';
  process.env.ADMIN_SECRET_KEY = validSecret;
  config = getAdminConfig();
  assert(config.enabled === true, 'Admin panel enabled with valid 16+ char secret');
  assert(config.panelPath === 'admin', 'panelPath is fixed to "admin" and completely ignores ADMIN_PANEL_PATH env var');

  // 3. verifyAdminPassword against environment secret
  const validPassCheck = await verifyAdminPassword(validSecret);
  assert(validPassCheck === true, 'verifyAdminPassword accepts exact configured secret');

  const invalidPassCheck = await verifyAdminPassword('invalid-attempt-1234');
  assert(invalidPassCheck === false, 'verifyAdminPassword rejects wrong credentials');

  // 4. Session Token Generation, Validation & Expiration
  const sessionToken = await createAdminSession();
  assert(typeof sessionToken === 'string' && sessionToken.length === 64, 'Generates 64-char hex random session token');

  const sessionValid = await verifyAdminSession(sessionToken);
  assert(sessionValid === true, 'Session token is immediately valid');

  const fakeSessionValid = await verifyAdminSession('fake-token-00000000000000000000000000000000');
  assert(fakeSessionValid === false, 'Rejects nonexistent session token');

  await destroyAdminSession(sessionToken);
  const sessionAfterDestroy = await verifyAdminSession(sessionToken);
  assert(sessionAfterDestroy === false, 'Session token invalid immediately after destroy');

  // 5. Analytics Repository: Recording Uploads & Views
  const mockMedia: MediaObject = {
    id: 'test-admin-file-01.png',
    name: 'Dashboard Mock Screenshot.png',
    originalFileName: 'Dashboard Mock Screenshot.png',
    size: 1572864, // 1.5 MB
    formattedSize: '1.5 MB',
    type: 'image',
    mimeType: 'image/png',
    provider: 'catbox',
    createdAt: Date.now(),
    uploaderCountryCode: 'ID',
    shareUrl: 'https://files.catbox.moe/test.png',
    publicShareUrl: 'http://localhost:3000/s/test-admin-file-01.png',
  };

  await analyticsRepository.recordUpload(mockMedia);
  await analyticsRepository.recordShareView(mockMedia.id);
  await analyticsRepository.recordShareView(mockMedia.id);

  const todayStr = getTodayDateString();
  const summary = await analyticsRepository.getDailySummary(todayStr);

  assert(summary.uploads >= 1, 'Daily summary records upload count >= 1');
  assert(summary.bytes >= mockMedia.size, 'Daily summary aggregates total uploaded bytes');
  assert(summary.totalViews >= 2, 'Daily summary aggregates share landing views >= 2');
  assert(summary.byType['image'] >= 1, 'Daily summary aggregates media by type');
  assert(summary.byCountry['ID'] >= 1, 'Daily summary aggregates uploads by country');

  const topFiles = await analyticsRepository.getTopFiles(5);
  const foundTop = topFiles.find((f) => f.id === mockMedia.id);
  assert(Boolean(foundTop && foundTop.views >= 2), 'getTopFiles tracks file view rankings');

  const trend = await analyticsRepository.getWeeklyTrend();
  assert(trend.length === 7, 'getWeeklyTrend returns exactly 7 days of metrics');
  assert(trend[trend.length - 1].date === todayStr, 'Last item of weekly trend is today');

  // 6. Recommendation Engine (generateRecommendations pure function)
  // Test case: Dominant country (> 70%)
  const dominantStats: DailyStats = {
    date: todayStr,
    uploads: 10,
    bytes: 20 * 1024 * 1024,
    formattedBytes: '20 MB',
    totalViews: 15,
    averageFileSize: 2 * 1024 * 1024,
    formattedAverageSize: '2 MB',
    byType: { image: 8, video: 2 },
    byCountry: { ID: 9, US: 1 }, // 90% ID
  };
  const recsDominant = generateRecommendations(dominantStats, trend, topFiles);
  assert(
    recsDominant.some((r) => r.includes('70%') && r.includes('ID')),
    'Recommendation triggers on dominant country (>70%)'
  );

  // Test case: High average file size approaching limit (> 100MB)
  const heavyStats: DailyStats = {
    ...dominantStats,
    averageFileSize: 150 * 1024 * 1024, // 150MB
    formattedAverageSize: '150 MB',
    byCountry: { ID: 3, US: 3, SG: 4 },
  };
  const recsHeavy = generateRecommendations(heavyStats, trend, topFiles);
  assert(
    recsHeavy.some((r) => r.includes('mendekati ambang batas kapasitas 200 MB')),
    'Recommendation triggers when average size is near 200MB limit'
  );

  // Test case: Outlier file view count (>50 views, >40% of total)
  const popularTop = [{ id: 'viral-video.mp4', name: 'Viral Video.mp4', views: 250 }];
  const viralStats: DailyStats = {
    ...dominantStats,
    totalViews: 300,
    byCountry: { ID: 2, US: 2, JP: 2, DE: 2 },
  };
  const recsViral = generateRecommendations(viralStats, trend, popularTop);
  assert(
    recsViral.some((r) => r.includes('sangat populer') && r.includes('CDN')),
    'Recommendation triggers for outlier popular file'
  );

  // 7. Live Stats Polling API Integration & Auth Enforcement
  const { createExpressApp } = await import('../app');
  process.env.ADMIN_SECRET_KEY = 'super-secret-key-16-chars-min!';

  const app = createExpressApp();
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 7.1: Unauthenticated live stats API returns 401 JSON (not HTML redirect)
    const unauthRes = await fetch(`${baseUrl}/admin/api/live-stats`, {
      headers: { 'Accept': 'application/json' },
    });
    assert(unauthRes.status === 401, 'Unauthenticated GET /api/live-stats returns 401');
    const unauthJson = await unauthRes.json();
    assert(
      unauthJson.success === false && unauthJson.error?.code === 'ADMIN_UNAUTHORIZED',
      'Unauthenticated live stats returns structured JSON error code ADMIN_UNAUTHORIZED'
    );

    // 7.2: Authenticated live stats API returns real-time stats JSON
    const authSessionToken = await createAdminSession();
    const authRes = await fetch(`${baseUrl}/admin/api/live-stats`, {
      headers: {
        'Accept': 'application/json',
        'Cookie': `admin_auth_token=${authSessionToken}`,
      },
    });
    assert(authRes.status === 200, 'Authenticated GET /api/live-stats returns 200');
    const liveData = await authRes.json();
    assert(
      liveData.success === true &&
      liveData.today !== undefined &&
      typeof liveData.totalItemsInRepo === 'number' &&
      liveData.redis !== undefined &&
      typeof liveData.redis.configured === 'boolean' &&
      liveData.catbox !== undefined &&
      typeof liveData.catbox.available === 'boolean' &&
      Array.isArray(liveData.recentUploads),
      'Authenticated GET /api/live-stats returns full real-time schema with health and totals'
    );
    assert(
      liveData.recentUploads.every((u: any) => u.sessionId === undefined && !('sessionId' in u)),
      'Authenticated GET /api/live-stats never leaks sessionId in recentUploads array'
    );

    // Test: Unauthenticated calls to new admin endpoints return 401
    const unauthDel = await fetch(`${baseUrl}/admin/api/delete-permanent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'any_id' }),
    });
    assert(unauthDel.status === 401, 'Unauthenticated POST /api/delete-permanent returns 401');

    const unauthSync = await fetch(`${baseUrl}/admin/api/sync-check`, {
      method: 'POST',
    });
    assert(unauthSync.status === 401, 'Unauthenticated POST /api/sync-check returns 401');

    const unauthHist = await fetch(`${baseUrl}/admin/api/delete-history-only`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'any_id' }),
    });
    assert(unauthHist.status === 401, 'Unauthenticated POST /api/delete-history-only returns 401');

    // Test: Authenticated POST /api/delete-permanent with missing id returns 400
    const authDelBad = await fetch(`${baseUrl}/admin/api/delete-permanent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `admin_auth_token=${authSessionToken}`,
      },
      body: JSON.stringify({}),
    });
    assert(authDelBad.status === 400, 'Authenticated POST /api/delete-permanent with missing ID returns 400');

    // Test: Authenticated POST /api/sync-check returns valid sync check summary
    const authSyncRes = await fetch(`${baseUrl}/admin/api/sync-check`, {
      method: 'POST',
      headers: {
        Cookie: `admin_auth_token=${authSessionToken}`,
      },
    });
    assert(authSyncRes.status === 200, 'Authenticated POST /api/sync-check returns 200');
    const syncData = await authSyncRes.json();
    assert(
      syncData.success === true &&
      typeof syncData.totalChecked === 'number' &&
      typeof syncData.healthyCount === 'number' &&
      typeof syncData.brokenCount === 'number' &&
      Array.isArray(syncData.brokenItems),
      'Authenticated POST /api/sync-check returns valid SyncCheckSummary structure'
    );

    // Create item to test permanent deletion
    const { getMediaRepository } = await import('../repository/media-repository');
    const mediaRepo = getMediaRepository();
    const testItem = await mediaRepo.create({
      id: 'test-admin-del-123.jpg',
      name: 'test-del.jpg',
      originalFileName: 'test-del.jpg',
      size: 1024,
      formattedSize: '1 KB',
      type: 'image',
      mimeType: 'image/jpeg',
      shareUrl: 'https://files.catbox.moe/test-admin-del-123.jpg',
      provider: 'catbox',
      createdAt: Date.now(),
      sessionId: 'admin-test-session-xyz',
    });

    // Test: Authenticated POST /api/delete-permanent cleans item from repo
    const authDelRes = await fetch(`${baseUrl}/admin/api/delete-permanent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `admin_auth_token=${authSessionToken}`,
      },
      body: JSON.stringify({ id: testItem.id }),
    });
    assert(authDelRes.status === 200, 'Authenticated POST /api/delete-permanent returns 200');
    const delData = await authDelRes.json();
    assert(delData.success === true, 'Authenticated POST /api/delete-permanent reports success');

    // Verify item is now gone from admin lookup
    const postDelLookup = await mediaRepo.getByIdForAdmin(testItem.id);
    assert(postDelLookup === null, 'Item is deleted from MediaRepository after delete-permanent');

    // Test: Unauthenticated POST /api/ai-recommendations returns 401
    const unauthAi = await fetch(`${baseUrl}/admin/api/ai-recommendations`, {
      method: 'POST',
    });
    assert(unauthAi.status === 401, 'Unauthenticated POST /api/ai-recommendations returns 401');

    // Test: Authenticated POST /api/ai-recommendations returns 200 with summary & recommendations
    const authAiRes = await fetch(`${baseUrl}/admin/api/ai-recommendations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `admin_auth_token=${authSessionToken}`,
      },
    });
    assert(authAiRes.status === 200, 'Authenticated POST /api/ai-recommendations returns 200');
    const aiData = await authAiRes.json();
    assert(
      aiData.success === true &&
      typeof aiData.summary === 'string' &&
      Array.isArray(aiData.recommendations) &&
      aiData.recommendations.length > 0 &&
      (aiData.isAi === true ? typeof aiData.model === 'string' : (aiData.isAi === false && aiData.model === 'heuristic-engine')),
      'Authenticated POST /api/ai-recommendations returns structured summary and recommendation array'
    );

    await destroyAdminSession(authSessionToken);
  } finally {
    server.close();
    await analyticsRepository.resetForTesting();
    const { getMediaRepository } = await import('../repository/media-repository');
    const repo = getMediaRepository();
    if ('clearTestData' in repo && typeof (repo as any).clearTestData === 'function') {
      (repo as any).clearTestData();
    }
  }

  // Restore env vars
  if (origSecret !== undefined) process.env.ADMIN_SECRET_KEY = origSecret;
  else delete process.env.ADMIN_SECRET_KEY;

  console.log(`\n========================================`);
  console.log(`Admin Tests Finished: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAdminTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});

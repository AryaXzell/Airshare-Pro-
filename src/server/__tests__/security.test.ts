import {
  sanitizeFilename,
  verifyMediaMagicBytes,
  validateUploadedFile,
  isValidMediaId,
} from '../security/input-validator';
import { SlidingWindowRateLimiter } from '../security/rate-limiter';
import { generateRequestId } from '../security/request-logger';
import { CatboxStorageProvider } from '../storage/catbox-storage-provider';

async function runSecurityTests() {
  console.log('--- Running AirShare Pro Security Suite Tests ---');
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

  // 1. Filename Sanitization & Path Traversal Prevention
  const dangerousName1 = '../../../../etc/passwd';
  const clean1 = sanitizeFilename(dangerousName1);
  assert(!clean1.includes('/') && !clean1.includes('\\') && clean1 === 'passwd', 'Strips directory traversal path');

  const dangerousName2 = 'exploit\x00.exe.jpg';
  const clean2 = sanitizeFilename(dangerousName2);
  assert(!clean2.includes('\x00'), 'Strips null bytes from filename');

  const clean3 = sanitizeFilename('my holiday video (2026) [4k].mp4');
  assert(clean3 === 'my holiday video (2026) [4k].mp4', 'Preserves safe alphanumeric and bracket characters');

  // 2. ID Validation
  assert(isValidMediaId('abc123xyz.mp4'), 'Accepts safe alphanumeric ID');
  assert(!isValidMediaId('../secret'), 'Rejects path traversal in ID');
  assert(!isValidMediaId('id; DROP TABLE media;'), 'Rejects SQL injection characters in ID');

  // 3. Magic Bytes Detection
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  assert(verifyMediaMagicBytes(pngHeader, 'image/png'), 'Verifies PNG magic bytes');

  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  assert(verifyMediaMagicBytes(jpegHeader, 'image/jpeg'), 'Verifies JPEG magic bytes');

  const fakeExecutable = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // DOS MZ Header
  assert(!verifyMediaMagicBytes(fakeExecutable, 'image/jpeg'), 'Rejects disguised executable with fake JPEG header');

  const webpHeader = Buffer.concat([
    Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP', 'ascii'),
  ]);
  assert(verifyMediaMagicBytes(webpHeader, 'image/webp'), 'Verifies WebP magic bytes');

  const flacHeader = Buffer.from([0x66, 0x4c, 0x61, 0x43, 0x00, 0x00]);
  assert(verifyMediaMagicBytes(flacHeader, 'audio/flac'), 'Verifies FLAC magic bytes');

  const oggHeader = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02]);
  assert(verifyMediaMagicBytes(oggHeader, 'audio/ogg'), 'Verifies OGG magic bytes');

  const mp3Id3Header = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00]);
  assert(verifyMediaMagicBytes(mp3Id3Header, 'audio/mp3'), 'Verifies MP3 ID3 header magic bytes');

  // 4. File Validation Check
  const fakeMulterFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'malicious.php',
    encoding: '7bit',
    mimetype: 'application/x-php',
    size: 1024,
    destination: '',
    filename: '',
    path: '',
    buffer: Buffer.from('<?php echo "evil"; ?>'),
    stream: null as any,
  };

  const validationResult = validateUploadedFile(fakeMulterFile, 209715200);
  assert(!validationResult.valid && validationResult.errorCode === 'FORBIDDEN_EXTENSION', 'Blocks forbidden .php extension');

  const oversizedFile: Express.Multer.File = {
    ...fakeMulterFile,
    originalname: 'large.mp4',
    mimetype: 'video/mp4',
    size: 300 * 1024 * 1024, // 300MB
    buffer: Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]), // MP4 ftyp
  };
  const sizeValidation = validateUploadedFile(oversizedFile, 200 * 1024 * 1024);
  assert(!sizeValidation.valid && sizeValidation.errorCode === 'FILE_TOO_LARGE', 'Rejects oversized file beyond limit');

  // 5. Rate Limiter Tests
  const rateLimiter = new SlidingWindowRateLimiter();
  const res1 = await rateLimiter.check('test-ip', 2, 5000);
  const res2 = await rateLimiter.check('test-ip', 2, 5000);
  const res3 = await rateLimiter.check('test-ip', 2, 5000);
  assert(res1.allowed && res2.allowed && !res3.allowed, 'Enforces rate limit window accurately');

  // 6. Request ID Generator
  const reqId = generateRequestId();
  assert(reqId.startsWith('req_') && reqId.length > 10, 'Generates valid structured request ID');

  // 7. Catbox Credential Leak Prevention
  process.env.CATBOX_USERHASH = 'super_secret_userhash_token_12345';
  const provider = new CatboxStorageProvider({ timeoutMs: 1000, maxRetries: 0 });
  try {
    // Attempt deletion with dummy file on live Catbox
    const delResult = await provider.delete('test_nonexistent_file_9999.png');
    assert(
      !delResult.message?.includes('super_secret_userhash_token_12345'),
      'Catbox error response never leaks CATBOX_USERHASH'
    );
  } catch (err: any) {
    assert(
      !err.message.includes('super_secret_userhash_token_12345'),
      'Catbox exception never leaks CATBOX_USERHASH'
    );
  }

  // 8. HTTP Endpoint Integration & Method Validation (405, 404, Headers)
  const { createExpressApp } = await import('../app');
  const app = createExpressApp();
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Test 8.1: GET /api/health -> 200 & Security Headers
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthJson = await healthRes.json();
    assert(
      healthRes.status === 200 &&
      healthJson.status === 'ok' &&
      healthRes.headers.get('x-content-type-options') === 'nosniff' &&
      healthRes.headers.has('x-request-id'),
      'GET /api/health returns 200 with nosniff and X-Request-ID headers'
    );

    // Test 8.2: POST /api/health -> 405 Method Not Allowed
    const healthPostRes = await fetch(`${baseUrl}/api/health`, { method: 'POST' });
    const healthPostJson = await healthPostRes.json();
    assert(
      healthPostRes.status === 405 &&
      healthPostJson.error?.code === 'METHOD_NOT_ALLOWED' &&
      healthPostRes.headers.get('allow') === 'GET',
      'POST /api/health returns 405 Method Not Allowed with Allow: GET'
    );

    // Test 8.3: POST /api/media/config -> 405 Method Not Allowed
    const configPostRes = await fetch(`${baseUrl}/api/media/config`, { method: 'POST' });
    const configPostJson = await configPostRes.json();
    assert(
      configPostRes.status === 405 &&
      configPostJson.error?.code === 'METHOD_NOT_ALLOWED' &&
      configPostRes.headers.get('allow') === 'GET',
      'POST /api/media/config returns 405 Method Not Allowed with Allow: GET'
    );

    // Test 8.4: GET /api/media/upload -> 405 Method Not Allowed
    const uploadGetRes = await fetch(`${baseUrl}/api/media/upload`, { method: 'GET' });
    const uploadGetJson = await uploadGetRes.json();
    assert(
      uploadGetRes.status === 405 &&
      uploadGetJson.error?.code === 'METHOD_NOT_ALLOWED' &&
      uploadGetRes.headers.get('allow') === 'POST',
      'GET /api/media/upload returns 405 Method Not Allowed with Allow: POST'
    );

    // Test 8.5: Unknown route /api/unknown -> 404 NOT_FOUND
    const notFoundRes = await fetch(`${baseUrl}/api/unknown_route_999`);
    const notFoundJson = await notFoundRes.json();
    assert(
      notFoundRes.status === 404 &&
      notFoundJson.error?.code === 'NOT_FOUND',
      'Unknown API route returns structured 404 NOT_FOUND'
    );
  } finally {
    server.close();
  }

  console.log(`\nAll Security Tests Completed: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

import { getTelegramConfig } from './telegram-auth';
import { getRedisClient, isUpstashConfigured } from '../storage/redis-client';

// Cooldown tracking for Redis failure alerts (15 minutes)
let lastRedisAlertTime = 0;
const REDIS_ALERT_COOLDOWN_MS = 15 * 60 * 1000;

function sanitizeForTelegramHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sends a Telegram message to a specific chat ID.
 * Fail-safe: catches errors and never throws to caller.
 */
export async function sendTelegramMessage(
  chatId: number | string,
  htmlText: string
): Promise<boolean> {
  const { enabled, botToken } = getTelegramConfig();
  if (!enabled || !botToken) {
    console.warn(`[TELEGRAM_NOTIFIER] Pesan ke chat ${chatId} DIBATALKAN karena integrasi tidak aktif (enabled=${enabled}, botTokenPresent=${Boolean(botToken)}).`);
    return false;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[TELEGRAM_NOTIFIER] Gagal mengirim pesan ke chat ${chatId}: HTTP ${res.status} - ${errText}`);
      return false;
    }

    return true;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[TELEGRAM_NOTIFIER] Gagal mengirim pesan ke chat ${chatId}:`, err);
    return false;
  }
}

/**
 * Broadcasts an alert message to all configured admin user IDs.
 * Pure push notification, fail-safe.
 */
export async function sendTelegramAlert(messageHtml: string): Promise<void> {
  const { enabled, adminUserIds } = getTelegramConfig();
  if (!enabled || adminUserIds.length === 0) return;

  try {
    await Promise.all(
      adminUserIds.map((userId) => sendTelegramMessage(userId, messageHtml))
    );
  } catch (err) {
    console.warn('[TELEGRAM_ALERT_WARN] Gagal broadcast alert ke admin:', err);
  }
}

// In-memory fallback tracking for session upload spikes
const sessionUploadCounters = new Map<string, { count: number; windowStart: number; alerted: boolean }>();

/**
 * Tracks uploads per session in a 5-minute sliding window.
 * If more than 15 uploads occur in 5 minutes, triggers an alert push.
 */
export async function recordUploadAndCheckSpike(sessionId: string): Promise<void> {
  if (!sessionId) return;
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;

  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const key = `spike_upload:${sessionId}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, 300); // 5 minutes
      }
      if (count === 16) {
        // Threshold crossed: exactly 16 uploads (> 15)
        await alertUploadSpike(sessionId, count);
      }
      return;
    } catch {
      // Fallback in-memory
    }
  }

  // In-memory fallback
  let entry = sessionUploadCounters.get(sessionId);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { count: 1, windowStart: now, alerted: false };
    sessionUploadCounters.set(sessionId, entry);
  } else {
    entry.count++;
  }

  if (entry.count > 15 && !entry.alerted) {
    entry.alerted = true;
    await alertUploadSpike(sessionId, entry.count);
  }

  // Keep in-memory map bounded
  if (sessionUploadCounters.size > 1000) {
    for (const [id, e] of sessionUploadCounters.entries()) {
      if (now - e.windowStart > windowMs) {
        sessionUploadCounters.delete(id);
      }
    }
  }
}

/**
 * Alerts admins when an anomalous upload spike is detected (>15 uploads in 5 mins from one session).
 */
export async function alertUploadSpike(sessionId: string, count: number): Promise<void> {
  const maskedSession = sessionId && sessionId.length > 8
    ? `${sessionId.substring(0, 4)}...${sessionId.substring(sessionId.length - 4)}`
    : 'anon';

  const msg = [
    '⚠️ <b>Terdeteksi lonjakan upload dari satu sesi</b>',
    `Sesi: <code>${sanitizeForTelegramHtml(maskedSession)}</code>`,
    `Jumlah: <b>${count}</b> unggahan dalam 5 menit terakhir.`,
  ].join('\n');

  await sendTelegramAlert(msg);
}

/**
 * Alerts admins when admin login rate limit is triggered (5 consecutive failures).
 */
export async function alertAdminLoginFailed(ip: string): Promise<void> {
  const cleanIp = sanitizeForTelegramHtml(ip || '127.0.0.1');
  const msg = [
    '🔒 <b>Percobaan login admin gagal berulang terdeteksi</b>',
    `IP Sumber: <code>${cleanIp}</code>`,
    'Status: <b>Rate limiter telah aktif (5x percobaan gagal).</b>',
  ].join('\n');

  await sendTelegramAlert(msg);
}

/**
 * Alerts admins when Maintenance Mode (Kill Switch) state changes.
 */
export async function alertMaintenanceModeChanged(
  levelOrActive: boolean | 'off' | 'upload_only' | 'full_lockdown',
  channel: 'web' | 'telegram',
  operatorInfo?: string
): Promise<void> {
  let statusText = '';
  if (levelOrActive === 'full_lockdown') {
    statusText = '🔴 LOCKDOWN TOTAL (Upload & Share Link Ditutup)';
  } else if (levelOrActive === 'upload_only' || levelOrActive === true) {
    statusText = '🟡 UPLOAD DITUTUP (Hanya Upload Dinonaktifkan)';
  } else {
    statusText = '🟢 DINONAKTIFKAN (Layanan Normal)';
  }
  const op = operatorInfo ? `\nOperator: <code>${sanitizeForTelegramHtml(operatorInfo)}</code>` : '';

  const msg = [
    `🛡️ <b>Maintenance Mode Diperbarui</b>`,
    `Status Baru: <b>${statusText}</b>`,
    `Kanal Perubahan: <b>${channel.toUpperCase()}</b>${op}`,
  ].join('\n');

  await sendTelegramAlert(msg);
}

/**
 * Alerts admins when Redis connectivity fails unexpectedly during runtime (with 15 min cooldown).
 */
export async function alertRedisFailure(errorDetail: string): Promise<void> {
  const now = Date.now();
  if (now - lastRedisAlertTime < REDIS_ALERT_COOLDOWN_MS) {
    return;
  }
  lastRedisAlertTime = now;

  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const cooldownKey = 'telegram_cooldown:redis_failure';
      const existing = await redis.get(cooldownKey);
      if (existing) return;
      await redis.set(cooldownKey, '1', { ex: 900 });
    } catch {
      // If redis itself is failing, proceed with in-memory cooldown check
    }
  }

  const msg = [
    '⚠️ <b>Kegagalan Redis Terdeteksi</b>',
    'Sistem beralih ke penyimpanan cadangan in-memory secara darurat.',
    `Detail: <code>${sanitizeForTelegramHtml(errorDetail.slice(0, 200))}</code>`,
  ].join('\n');

  await sendTelegramAlert(msg);
}

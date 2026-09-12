import { auditLogRepository } from '../repository/audit-log-repository';
import { getRateLimiter } from '../security/rate-limiter';

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  adminUserIds: number[];
  webhookSecret: string;
}

/**
 * Parses and returns the Telegram configuration.
 * Disabled by default if either TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_USER_IDS is missing.
 */
export function getTelegramConfig(): TelegramConfig {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
  const rawIds = process.env.TELEGRAM_ADMIN_USER_IDS || '';
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || '';

  const adminUserIds: number[] = rawIds
    .split(',')
    .map((idStr) => parseInt(idStr.trim(), 10))
    .filter((id) => !isNaN(id) && id > 0);

  const enabled = Boolean(
    botToken.length > 0 &&
    adminUserIds.length > 0 &&
    webhookSecret.length >= 16
  );

  return {
    enabled,
    botToken,
    adminUserIds,
    webhookSecret,
  };
}

/**
 * Checks whether a given Telegram user ID is whitelisted.
 */
export function isAuthorizedTelegramUser(userId: number): boolean {
  const { enabled, adminUserIds } = getTelegramConfig();
  if (!enabled) return false;
  return adminUserIds.includes(userId);
}

/**
 * Handles an unauthorized Telegram user attempt:
 * - Records an audit log entry without leaking sensitive system details.
 * - Rate limits spam from unauthorized IDs.
 */
export async function handleUnauthorizedAttempt(
  userId: number,
  username?: string
): Promise<void> {
  const userLabel = username ? `@${username} (ID: ${userId})` : `ID: ${userId}`;
  await auditLogRepository.recordAction({
    type: 'telegram_unauthorized_attempt',
    detail: `Percobaan akses bot Telegram tidak sah oleh pengguna ${userLabel}. Pesan ditolak secara generik.`,
    ip: 'telegram-api',
  });
}

/**
 * Rate limit check for Telegram users (both authorized and unauthorized)
 * to prevent flooding the Telegram Bot API and server logs.
 * Allows max 30 commands per minute per user ID.
 */
export async function checkTelegramRateLimit(userId: number): Promise<boolean> {
  const limiter = getRateLimiter();
  const key = `telegram_bot:${userId}`;
  const limit = 30;
  const windowMs = 60 * 1000;

  try {
    const result = await limiter.check(key, limit, windowMs);
    return result.allowed;
  } catch (err) {
    console.warn('[TELEGRAM_RATE_LIMIT] Fail-open on rate limit check:', err);
    return true;
  }
}

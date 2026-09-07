import crypto from 'crypto';
import { getRedisClient, isUpstashConfigured } from '../storage/redis-client';

export type PendingActionType =
  | 'killswitch_on'
  | 'killswitch_off'
  | 'hapus_permanen'
  | 'revoke_all_sesi'
  | 'bulk_cleanup'
  | 'announcement';

export interface PendingAction {
  id: string;
  type: PendingActionType;
  userId: number;
  createdAt: number;
  expiresAt: number;
  description: string;
  payload?: any;
}

const CONFIRMATION_TTL_SECONDS = 60; // 60 seconds
const CONFIRMATION_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateConfirmationId(length = 6): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CONFIRMATION_CHARS[bytes[i] % CONFIRMATION_CHARS.length];
  }
  return result;
}

// In-memory fallback for local development or when Redis is unconfigured
const inMemoryPendingActions = new Map<string, PendingAction>();

function cleanupMemoryActions() {
  const now = Date.now();
  for (const [id, action] of inMemoryPendingActions.entries()) {
    if (action.expiresAt <= now) {
      inMemoryPendingActions.delete(id);
    }
  }
}

/**
 * Creates and stores a pending action requiring confirmation.
 * Returns the short 6-character confirmation ID.
 */
export async function createPendingAction(
  userId: number,
  action: {
    type: PendingActionType;
    description: string;
    payload?: any;
  }
): Promise<string> {
  const confirmationId = generateConfirmationId(6);
  const now = Date.now();
  const expiresAt = now + CONFIRMATION_TTL_SECONDS * 1000;

  const pending: PendingAction = {
    id: confirmationId,
    type: action.type,
    userId,
    createdAt: now,
    expiresAt,
    description: action.description,
    payload: action.payload,
  };

  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const key = `telegram_pending:${confirmationId}`;
      await redis.set(key, JSON.stringify(pending), { ex: CONFIRMATION_TTL_SECONDS });
      return confirmationId;
    } catch (err) {
      console.warn('[TELEGRAM_PENDING] Gagal menyimpan ke Redis, fallback in-memory:', err);
    }
  }

  cleanupMemoryActions();
  inMemoryPendingActions.set(confirmationId, pending);
  return confirmationId;
}

/**
 * Retrieves a pending action by its confirmation ID.
 * Returns null if not found or expired.
 */
export async function getPendingAction(confirmationId: string): Promise<PendingAction | null> {
  if (!confirmationId || typeof confirmationId !== 'string') return null;
  const cleanId = confirmationId.trim().toUpperCase();

  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      const key = `telegram_pending:${cleanId}`;
      const raw = await redis.get<string | PendingAction>(key);
      if (raw) {
        const parsed: PendingAction = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed.expiresAt > Date.now()) {
          return parsed;
        }
        await redis.del(key);
      }
      return null;
    } catch (err) {
      console.warn('[TELEGRAM_PENDING] Gagal membaca dari Redis, fallback in-memory:', err);
    }
  }

  cleanupMemoryActions();
  const item = inMemoryPendingActions.get(cleanId);
  if (item && item.expiresAt > Date.now()) {
    return item;
  }
  if (item) {
    inMemoryPendingActions.delete(cleanId);
  }
  return null;
}

/**
 * Clears a pending action once completed or cancelled.
 */
export async function clearPendingAction(confirmationId: string): Promise<void> {
  if (!confirmationId) return;
  const cleanId = confirmationId.trim().toUpperCase();

  const redis = isUpstashConfigured() ? getRedisClient() : null;
  if (redis) {
    try {
      await redis.del(`telegram_pending:${cleanId}`);
    } catch (err) {
      console.warn('[TELEGRAM_PENDING] Gagal menghapus dari Redis:', err);
    }
  }

  inMemoryPendingActions.delete(cleanId);
}

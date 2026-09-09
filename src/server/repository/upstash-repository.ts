import { Redis } from '@upstash/redis';
import { MediaObject, MediaRepository, MediaTombstone, PublicMediaView } from '../../types';

function assertValidSessionId(sessionId: unknown, operation: string): asserts sessionId is string {
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error(`sessionId wajib diisi untuk operasi repository ${operation}`);
  }
}

export class UpstashMediaRepository implements MediaRepository {
  constructor(private redis: Redis) {}

  private getItemKey(sessionId: string, id: string): string {
    return `media:${sessionId}:${id}`;
  }

  private getPublicKey(id: string): string {
    return `public_media:${id}`;
  }

  private getIndexKey(sessionId: string): string {
    return `media_idx:${sessionId}`;
  }

  /**
   * Dedicated small mapping key for cross-session admin operations: id -> sessionId.
   * Enables admin to look up and purge items across all sessions without full keyspace scanning.
   */
  private getIdToSessionKey(id: string): string {
    return `id_to_session:${id}`;
  }

  private getTombstoneKey(id: string): string {
    return `deleted_media:${id}`;
  }

  public async getTombstone(id: string): Promise<MediaTombstone | null> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      return null;
    }
    const cleanId = id.trim();
    try {
      const raw = await this.redis.get<string | MediaTombstone>(this.getTombstoneKey(cleanId));
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : (raw as MediaTombstone);
    } catch {
      return null;
    }
  }

  public async recordTombstone(id: string, reason: string): Promise<void> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      return;
    }
    const cleanId = id.trim();
    const tombstone: MediaTombstone = {
      id: cleanId,
      deletedAt: Date.now(),
      reason,
    };
    try {
      await this.redis.set(this.getTombstoneKey(cleanId), JSON.stringify(tombstone), {
        ex: 14 * 24 * 60 * 60,
      });
    } catch {
      // Fail-open
    }
  }

  public async create(media: MediaObject): Promise<MediaObject> {
    assertValidSessionId(media.sessionId, 'create');
    const sessionId = media.sessionId;
    const itemKey = this.getItemKey(sessionId, media.id);
    const publicKey = this.getPublicKey(media.id);
    const indexKey = this.getIndexKey(sessionId);
    const idToSessionKey = this.getIdToSessionKey(media.id);

    // Explicit PublicMediaView projection: never leak internal sessionId into public Redis key
    const publicMedia: PublicMediaView = {
      id: media.id,
      name: media.name,
      originalFileName: media.originalFileName,
      type: media.type,
      mimeType: media.mimeType,
      size: media.size,
      formattedSize: media.formattedSize,
      shareUrl: media.shareUrl,
      uploaderCountryCode: media.uploaderCountryCode,
      uploaderCountryName: media.uploaderCountryName,
      audioMeta: media.audioMeta,
      videoMeta: media.videoMeta,
      imageMeta: media.imageMeta,
      createdAt: media.createdAt,
      isTextPreviewable: media.isTextPreviewable,
      textLanguageHint: media.textLanguageHint,
    };

    // Pipeline: save media JSON, store filtered public lookup key, admin mapping, and add to session sorted set index
    const pipeline = this.redis.pipeline();
    pipeline.set(itemKey, JSON.stringify(media));
    pipeline.set(publicKey, JSON.stringify(publicMedia));
    pipeline.set(idToSessionKey, sessionId);
    pipeline.zadd(indexKey, { score: media.createdAt, member: media.id });
    // Keep 30-day retention on active session indices, public lookup, and admin mapping
    pipeline.expire(itemKey, 30 * 24 * 60 * 60);
    pipeline.expire(publicKey, 30 * 24 * 60 * 60);
    pipeline.expire(idToSessionKey, 30 * 24 * 60 * 60);
    pipeline.expire(indexKey, 30 * 24 * 60 * 60);

    // Clear any previous tombstone for this id
    const tombstoneKey = this.getTombstoneKey(media.id);
    pipeline.del(tombstoneKey);

    await pipeline.exec();
    return media;
  }

  public async list(sessionId: string, limit = 100): Promise<MediaObject[]> {
    assertValidSessionId(sessionId, 'list');
    const indexKey = this.getIndexKey(sessionId);
    // Fetch newest IDs first using ZREVRANGE
    const ids: string[] = await this.redis.zrange(indexKey, 0, limit - 1, { rev: true });

    if (!ids || ids.length === 0) {
      return [];
    }

    const itemKeys = ids.map((id) => this.getItemKey(sessionId, id));
    // Batch fetch media items
    const rawItems = await this.redis.mget<string[]>(...itemKeys);

    const result: MediaObject[] = [];
    rawItems.forEach((raw) => {
      if (raw) {
        try {
          const item = typeof raw === 'string' ? JSON.parse(raw) : raw;
          result.push(item);
        } catch {
          // Ignore parse errors on corrupt items
        }
      }
    });

    return result;
  }

  public async get(id: string, sessionId: string): Promise<MediaObject | null> {
    assertValidSessionId(sessionId, 'get');
    const itemKey = this.getItemKey(sessionId, id);
    const raw = await this.redis.get<string>(itemKey);
    if (!raw) return null;

    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }

  public async getByIdPublic(id: string): Promise<PublicMediaView | null> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      return null;
    }
    const cleanId = id.trim();

    // 1. If marked as deleted tombstone, NEVER return it
    const tombstone = await this.getTombstone(cleanId);
    if (tombstone) {
      return null;
    }

    const publicKey = this.getPublicKey(cleanId);
    const raw = await this.redis.get<string>(publicKey);

    let publicMedia: PublicMediaView | null = null;
    if (raw) {
      try {
        publicMedia = typeof raw === 'string' ? JSON.parse(raw) : (raw as PublicMediaView);
      } catch {
        publicMedia = null;
      }
    }

    // 2. STRICT RULE: DO NOT resurrect a file if publicMedia is null!
    // A missing publicMedia key means the item was deleted.
    // Only enrich if publicMedia ALREADY exists in repository, but is missing country code or createdAt
    if (publicMedia && (!publicMedia.uploaderCountryCode || !publicMedia.createdAt)) {
      try {
        const fullRaw = await this.redis.get<string>(`stats:media_obj:${cleanId}`);
        if (fullRaw) {
          const full = typeof fullRaw === 'string' ? JSON.parse(fullRaw) : (fullRaw as MediaObject);
          if (full && typeof full === 'object') {
            if (!publicMedia.uploaderCountryCode && full.uploaderCountryCode) {
              publicMedia.uploaderCountryCode = full.uploaderCountryCode;
              publicMedia.uploaderCountryName = full.uploaderCountryName;
            }
            if ((!publicMedia.createdAt || isNaN(publicMedia.createdAt)) && full.createdAt) {
              publicMedia.createdAt = full.createdAt;
            }
            if (!publicMedia.audioMeta && full.audioMeta && full.type === 'audio') {
              publicMedia.audioMeta = full.audioMeta;
            }
            if (!publicMedia.videoMeta && full.videoMeta && full.type === 'video') {
              publicMedia.videoMeta = full.videoMeta;
            }
            if (!publicMedia.imageMeta && full.imageMeta && full.type === 'image') {
              publicMedia.imageMeta = full.imageMeta;
            }
            if (publicMedia.isTextPreviewable === undefined && full.isTextPreviewable !== undefined) {
              publicMedia.isTextPreviewable = full.isTextPreviewable;
              publicMedia.textLanguageHint = full.textLanguageHint;
            }
          }
        }
      } catch {
        // Fail-open
      }
    }

    return publicMedia;
  }

  public async delete(id: string, sessionId: string): Promise<boolean> {
    assertValidSessionId(sessionId, 'delete');
    const cleanId = id.trim();
    const itemKey = this.getItemKey(sessionId, cleanId);
    const publicKey = this.getPublicKey(cleanId);
    const indexKey = this.getIndexKey(sessionId);
    const idToSessionKey = this.getIdToSessionKey(cleanId);
    const tombstoneKey = this.getTombstoneKey(cleanId);

    const tombstoneData: MediaTombstone = {
      id: cleanId,
      deletedAt: Date.now(),
      reason: 'USER_DELETED',
    };

    const pipeline = this.redis.pipeline();
    pipeline.del(itemKey);
    pipeline.del(publicKey);
    pipeline.del(idToSessionKey);
    pipeline.del(`stats:media_obj:${cleanId}`);
    pipeline.zrem(indexKey, cleanId);
    pipeline.zrem('stats:recent_uploads', cleanId);
    if (typeof pipeline.set === 'function') {
      pipeline.set(tombstoneKey, JSON.stringify(tombstoneData), { ex: 14 * 24 * 60 * 60 });
    }
    const results = await pipeline.exec();

    // Fallback if pipeline.set wasn't available in pipeline mock
    if (typeof pipeline.set !== 'function') {
      this.recordTombstone(cleanId, 'USER_DELETED').catch(() => {});
    }

    const delCount = results[0] as number;
    return typeof delCount === 'number' && delCount > 0;
  }

  public async clearAll(sessionId: string): Promise<void> {
    assertValidSessionId(sessionId, 'clearAll');
    const indexKey = this.getIndexKey(sessionId);
    // Fetch all item IDs in this session
    const ids: string[] = await this.redis.zrange(indexKey, 0, -1);

    const pipeline = this.redis.pipeline();
    if (ids && ids.length > 0) {
      const now = Date.now();
      ids.forEach((id) => {
        const cleanId = id.trim();
        pipeline.del(this.getItemKey(sessionId, cleanId));
        pipeline.del(this.getPublicKey(cleanId));
        pipeline.del(this.getIdToSessionKey(cleanId));
        pipeline.del(`stats:media_obj:${cleanId}`);
        pipeline.zrem('stats:recent_uploads', cleanId);
        if (typeof pipeline.set === 'function') {
          pipeline.set(
            this.getTombstoneKey(cleanId),
            JSON.stringify({ id: cleanId, deletedAt: now, reason: 'USER_CLEARED' }),
            { ex: 14 * 24 * 60 * 60 }
          );
        }
      });
    }
    pipeline.del(indexKey);
    await pipeline.exec();
  }

  /**
   * Internal Administrative Method ONLY.
   * Looks up a media item across all sessions using the explicit id_to_session mapping,
   * falling back to public_media and stats:media_obj for legacy entries.
   */
  public async getByIdForAdmin(id: string): Promise<MediaObject | null> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      return null;
    }
    const cleanId = id.trim();
    const idToSessionKey = this.getIdToSessionKey(cleanId);
    const sessionId = await this.redis.get<string>(idToSessionKey);

    if (sessionId) {
      const itemKey = this.getItemKey(sessionId, cleanId);
      const raw = await this.redis.get<string>(itemKey);
      if (raw) {
        try {
          return typeof raw === 'string' ? JSON.parse(raw) : (raw as MediaObject);
        } catch {
          // Fall through to fallback
        }
      }
    }

    // Fallback for items created prior to id_to_session mapping
    const publicKey = this.getPublicKey(cleanId);
    const pubRaw = await this.redis.get<string>(publicKey);
    if (pubRaw) {
      try {
        const pub = typeof pubRaw === 'string' ? JSON.parse(pubRaw) : (pubRaw as PublicMediaView);
        if (pub) {
          return {
            ...pub,
            sessionId: sessionId || 'admin_recovered_session',
          };
        }
      } catch {
        // Fall through
      }
    }

    const statsRaw = await this.redis.get<string>(`stats:media_obj:${cleanId}`);
    if (statsRaw) {
      try {
        const statsObj = typeof statsRaw === 'string' ? JSON.parse(statsRaw) : (statsRaw as any);
        if (statsObj) {
          return {
            ...statsObj,
            sessionId: sessionId || 'admin_recovered_session',
          };
        }
      } catch {
        // Fall through
      }
    }

    return null;
  }

  /**
   * Internal Administrative Method ONLY.
   * Permanently deletes all Redis keys for an item across all sessions, indices, and lookups.
   */
  public async deleteForAdmin(id: string): Promise<boolean> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      return false;
    }
    const cleanId = id.trim();
    const idToSessionKey = this.getIdToSessionKey(cleanId);
    const sessionId = await this.redis.get<string>(idToSessionKey);
    const tombstoneKey = this.getTombstoneKey(cleanId);

    const tombstoneData: MediaTombstone = {
      id: cleanId,
      deletedAt: Date.now(),
      reason: 'ADMIN_DELETED',
    };

    const pipeline = this.redis.pipeline();
    pipeline.del(this.getPublicKey(cleanId));
    pipeline.del(idToSessionKey);
    pipeline.del(`stats:media_obj:${cleanId}`);
    pipeline.zrem('stats:recent_uploads', cleanId);
    if (typeof pipeline.set === 'function') {
      pipeline.set(tombstoneKey, JSON.stringify(tombstoneData), { ex: 14 * 24 * 60 * 60 });
    }

    if (sessionId) {
      pipeline.del(this.getItemKey(sessionId, cleanId));
      pipeline.zrem(this.getIndexKey(sessionId), cleanId);
    }

    const results = await pipeline.exec();
    if (typeof pipeline.set !== 'function') {
      this.recordTombstone(cleanId, 'ADMIN_DELETED').catch(() => {});
    }
    return results.some((r) => typeof r === 'number' && r > 0);
  }
}

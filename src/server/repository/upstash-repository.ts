import { Redis } from '@upstash/redis';
import { MediaObject, MediaRepository, PublicMediaView } from '../../types';

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

    // Self-healing / backwards compatibility:
    // If public record is missing or lacks country code/timestamp, check global stats:media_obj
    if (!publicMedia || !publicMedia.uploaderCountryCode || !publicMedia.createdAt) {
      try {
        const fullRaw = await this.redis.get<string>(`stats:media_obj:${cleanId}`);
        if (fullRaw) {
          const full = typeof fullRaw === 'string' ? JSON.parse(fullRaw) : (fullRaw as MediaObject);
          if (full && typeof full === 'object') {
            if (!publicMedia) {
              publicMedia = {
                id: full.id || cleanId,
                name: full.name || 'Berkas',
                originalFileName: full.originalFileName || full.name || 'Berkas',
                type: full.type || 'file',
                mimeType: full.mimeType || 'application/octet-stream',
                size: full.size || 0,
                formattedSize: full.formattedSize || '0 B',
                shareUrl: full.shareUrl || '',
                createdAt: full.createdAt || Date.now(),
                uploaderCountryCode: full.uploaderCountryCode,
                uploaderCountryName: full.uploaderCountryName,
                audioMeta: full.audioMeta,
                videoMeta: full.videoMeta,
                imageMeta: full.imageMeta,
                isTextPreviewable: full.isTextPreviewable,
                textLanguageHint: full.textLanguageHint,
              };
            } else {
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
            // Asynchronously sync recovered fields back to public Redis key (30-day TTL)
            this.redis.set(publicKey, JSON.stringify(publicMedia), { ex: 30 * 24 * 60 * 60 }).catch(() => {});
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
    const itemKey = this.getItemKey(sessionId, id);
    const publicKey = this.getPublicKey(id);
    const indexKey = this.getIndexKey(sessionId);
    const idToSessionKey = this.getIdToSessionKey(id);

    const pipeline = this.redis.pipeline();
    pipeline.del(itemKey);
    pipeline.del(publicKey);
    pipeline.del(idToSessionKey);
    pipeline.zrem(indexKey, id);
    const results = await pipeline.exec();

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
      ids.forEach((id) => {
        pipeline.del(this.getItemKey(sessionId, id));
        pipeline.del(this.getPublicKey(id));
        pipeline.del(this.getIdToSessionKey(id));
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

    const pipeline = this.redis.pipeline();
    pipeline.del(this.getPublicKey(cleanId));
    pipeline.del(idToSessionKey);
    pipeline.del(`stats:media_obj:${cleanId}`);
    pipeline.zrem('stats:recent_uploads', cleanId);

    if (sessionId) {
      pipeline.del(this.getItemKey(sessionId, cleanId));
      pipeline.zrem(this.getIndexKey(sessionId), cleanId);
    }

    const results = await pipeline.exec();
    return results.some((r) => typeof r === 'number' && r > 0);
  }
}

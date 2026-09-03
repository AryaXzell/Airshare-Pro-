import { Redis } from '@upstash/redis';
import { MediaObject, MediaRepository } from '../../types';

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

  public async create(media: MediaObject): Promise<MediaObject> {
    assertValidSessionId(media.sessionId, 'create');
    const sessionId = media.sessionId;
    const itemKey = this.getItemKey(sessionId, media.id);
    const publicKey = this.getPublicKey(media.id);
    const indexKey = this.getIndexKey(sessionId);

    // Pipeline: save media JSON, store public lookup key, and add to session sorted set index
    const pipeline = this.redis.pipeline();
    pipeline.set(itemKey, JSON.stringify(media));
    pipeline.set(publicKey, JSON.stringify(media));
    pipeline.zadd(indexKey, { score: media.createdAt, member: media.id });
    // Keep 30-day retention on active session indices and public lookup
    pipeline.expire(itemKey, 30 * 24 * 60 * 60);
    pipeline.expire(publicKey, 30 * 24 * 60 * 60);
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

  public async getByIdPublic(id: string): Promise<MediaObject | null> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      return null;
    }
    const publicKey = this.getPublicKey(id.trim());
    const raw = await this.redis.get<string>(publicKey);
    if (!raw) return null;

    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }

  public async delete(id: string, sessionId: string): Promise<boolean> {
    assertValidSessionId(sessionId, 'delete');
    const itemKey = this.getItemKey(sessionId, id);
    const publicKey = this.getPublicKey(id);
    const indexKey = this.getIndexKey(sessionId);

    const pipeline = this.redis.pipeline();
    pipeline.del(itemKey);
    pipeline.del(publicKey);
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
      });
    }
    pipeline.del(indexKey);
    await pipeline.exec();
  }
}

import { MediaObject, MediaRepository } from '../../types';

function assertValidSessionId(sessionId: unknown, operation: string): asserts sessionId is string {
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error(`sessionId wajib diisi untuk operasi repository ${operation}`);
  }
}

export class DevelopmentMediaRepository implements MediaRepository {
  private items: Map<string, MediaObject> = new Map();
  private maxItems = 250;

  public async create(media: MediaObject): Promise<MediaObject> {
    assertValidSessionId(media.sessionId, 'create');

    // Evict oldest items if exceeding memory threshold in development
    if (this.items.size >= this.maxItems) {
      const oldestKey = this.items.keys().next().value;
      if (oldestKey) {
        this.items.delete(oldestKey);
      }
    }

    this.items.set(media.id, { ...media });
    return media;
  }

  public async list(sessionId: string, limit = 100): Promise<MediaObject[]> {
    assertValidSessionId(sessionId, 'list');
    let list = Array.from(this.items.values()).filter((item) => item.sessionId === sessionId);

    // Sort descending by createdAt (newest first)
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list.slice(0, limit);
  }

  public async get(id: string, sessionId: string): Promise<MediaObject | null> {
    assertValidSessionId(sessionId, 'get');
    const item = this.items.get(id);
    if (!item) return null;
    if (item.sessionId !== sessionId) {
      return null;
    }
    return { ...item };
  }

  public async getByIdPublic(id: string): Promise<MediaObject | null> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      return null;
    }
    const item = this.items.get(id.trim());
    if (!item) return null;
    return { ...item };
  }

  public async delete(id: string, sessionId: string): Promise<boolean> {
    assertValidSessionId(sessionId, 'delete');
    const item = this.items.get(id);
    if (!item) return false;
    if (item.sessionId !== sessionId) {
      return false;
    }
    return this.items.delete(id);
  }

  public async clearAll(sessionId: string): Promise<void> {
    assertValidSessionId(sessionId, 'clearAll');
    for (const [id, item] of this.items.entries()) {
      if (item.sessionId === sessionId) {
        this.items.delete(id);
      }
    }
  }
}

// Global singleton instance for server runtime
export const developmentMediaRepository = new DevelopmentMediaRepository();

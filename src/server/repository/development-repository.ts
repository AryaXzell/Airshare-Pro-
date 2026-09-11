import { MediaObject, MediaRepository, MediaTombstone, PublicMediaView } from '../../types';

function assertValidSessionId(sessionId: unknown, operation: string): asserts sessionId is string {
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error(`sessionId wajib diisi untuk operasi repository ${operation}`);
  }
}

export class DevelopmentMediaRepository implements MediaRepository {
  private items: Map<string, MediaObject> = new Map();
  private tombstones: Map<string, MediaTombstone> = new Map();
  private maxItems = 250;
  private maxTombstones = 1000;

  public async create(media: MediaObject): Promise<MediaObject> {
    assertValidSessionId(media.sessionId, 'create');

    // Remove from tombstones if re-created
    this.tombstones.delete(media.id);

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

  public async getByIdPublic(id: string): Promise<PublicMediaView | null> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      return null;
    }
    const cleanId = id.trim();
    if (this.tombstones.has(cleanId)) {
      return null;
    }
    const item = this.items.get(cleanId);
    if (!item) return null;
    const publicItem: PublicMediaView = {
      id: item.id,
      name: item.name,
      originalFileName: item.originalFileName,
      type: item.type,
      mimeType: item.mimeType,
      size: item.size,
      formattedSize: item.formattedSize,
      shareUrl: item.shareUrl,
      uploaderCountryCode: item.uploaderCountryCode,
      uploaderCountryName: item.uploaderCountryName,
      audioMeta: item.audioMeta,
      videoMeta: item.videoMeta,
      imageMeta: item.imageMeta,
      createdAt: item.createdAt,
      isTextPreviewable: item.isTextPreviewable,
      textLanguageHint: item.textLanguageHint,
    };
    return publicItem;
  }

  public async getTombstone(id: string): Promise<MediaTombstone | null> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      return null;
    }
    return this.tombstones.get(id.trim()) || null;
  }

  public async recordTombstone(id: string, reason: string): Promise<void> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      return;
    }
    const cleanId = id.trim();
    if (this.tombstones.size >= this.maxTombstones) {
      const oldestKey = this.tombstones.keys().next().value;
      if (oldestKey) this.tombstones.delete(oldestKey);
    }
    this.tombstones.set(cleanId, {
      id: cleanId,
      deletedAt: Date.now(),
      reason,
    });
  }

  public async delete(id: string, sessionId: string): Promise<boolean> {
    assertValidSessionId(sessionId, 'delete');
    const item = this.items.get(id);
    if (!item) return false;
    if (item.sessionId !== sessionId) {
      return false;
    }
    const deleted = this.items.delete(id);
    if (deleted) {
      await this.recordTombstone(id, 'USER_DELETED');
    }
    return deleted;
  }

  public async clearAll(sessionId: string): Promise<void> {
    assertValidSessionId(sessionId, 'clearAll');
    for (const [id, item] of this.items.entries()) {
      if (item.sessionId === sessionId) {
        this.items.delete(id);
        await this.recordTombstone(id, 'USER_CLEARED');
      }
    }
  }

  /**
   * Internal Administrative Method ONLY.
   * Cross-session lookup strictly for authenticated admin controller.
   */
  public async getByIdForAdmin(id: string): Promise<MediaObject | null> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      return null;
    }
    const item = this.items.get(id.trim());
    return item ? { ...item } : null;
  }

  /**
   * Internal Administrative Method ONLY.
   * Deletes item from repository across all sessions.
   */
  public async deleteForAdmin(id: string): Promise<boolean> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      return false;
    }
    const cleanId = id.trim();
    const deleted = this.items.delete(cleanId);
    await this.recordTombstone(cleanId, 'ADMIN_DELETED');
    return deleted;
  }

  /**
   * Cleans all mock/test fixture artifacts so automated tests or stale test runs
   * never pollute real development memory.
   */
  public clearTestData(): void {
    for (const id of Array.from(this.items.keys())) {
      if (
        id.startsWith('test-') ||
        id.startsWith('mock-') ||
        id.startsWith('secret_') ||
        id.startsWith('img_test_') ||
        id.startsWith('audio_test_')
      ) {
        this.items.delete(id);
      }
    }
  }

  public resetStore(): void {
    this.items.clear();
    this.tombstones.clear();
  }
}

// Global singleton instance for server runtime
export const developmentMediaRepository = new DevelopmentMediaRepository();

// Automatically prune any test fixture artifacts on startup
developmentMediaRepository.clearTestData();

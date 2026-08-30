import { MediaObject, MediaRepository } from '../../types';

export class DevelopmentMediaRepository implements MediaRepository {
  private items: Map<string, MediaObject> = new Map();
  private maxItems = 150;

  public async create(media: MediaObject): Promise<MediaObject> {
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

  public async list(limit = 100): Promise<MediaObject[]> {
    const list = Array.from(this.items.values());
    // Sort descending by createdAt (newest first)
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list.slice(0, limit);
  }

  public async get(id: string): Promise<MediaObject | null> {
    const item = this.items.get(id);
    return item ? { ...item } : null;
  }

  public async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }

  public async clearAll(): Promise<void> {
    this.items.clear();
  }
}

// Global singleton instance for server runtime
export const developmentMediaRepository = new DevelopmentMediaRepository();

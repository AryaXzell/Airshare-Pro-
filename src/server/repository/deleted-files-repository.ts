import { Redis } from '@upstash/redis';
import { DeletedFileRecord } from '../../types';
import { getRedisClient, isUpstashConfigured } from '../storage/redis-client';

const DELETED_FILES_INDEX = 'stats:deleted_files_index';
const DELETED_FILE_PREFIX = 'stats:deleted_file_obj:';
const MAX_DELETED_RECORDS = 500;
const RETENTION_SECONDS = 30 * 24 * 60 * 60; // 30 days

class InMemoryDeletedFilesStore {
  private records: DeletedFileRecord[] = [];

  record(file: DeletedFileRecord): void {
    // Avoid duplicate entries for the same ID
    this.records = this.records.filter((r) => r.id !== file.id);
    this.records.unshift(file);
    if (this.records.length > MAX_DELETED_RECORDS) {
      this.records = this.records.slice(0, MAX_DELETED_RECORDS);
    }
  }

  get(limit = 100): DeletedFileRecord[] {
    return this.records.slice(0, limit);
  }

  clear(): number {
    const count = this.records.length;
    this.records = [];
    return count;
  }

  isDeleted(id: string): boolean {
    return this.records.some((r) => r.id === id);
  }
}

const inMemoryStore = new InMemoryDeletedFilesStore();

export class DeletedFilesRepository {
  constructor(private redisClient?: Redis | null) {}

  private getRedis(): Redis | null {
    if (this.redisClient !== undefined) {
      return this.redisClient;
    }
    if (isUpstashConfigured()) {
      return getRedisClient();
    }
    return null;
  }

  /**
   * Records a deleted file in the isolated Deleted Files archive.
   * Fail-safe: Any errors are caught and logged without disrupting callers.
   */
  public async recordDeleted(file: DeletedFileRecord): Promise<void> {
    try {
      inMemoryStore.record(file);

      const redis = this.getRedis();
      if (!redis) return;

      const pipeline = redis.pipeline();
      const objKey = `${DELETED_FILE_PREFIX}${file.id}`;

      pipeline.zadd(DELETED_FILES_INDEX, { score: file.deletedAt, member: file.id });
      pipeline.set(objKey, JSON.stringify(file));
      pipeline.expire(objKey, RETENTION_SECONDS);

      await pipeline.exec();
    } catch (err) {
      console.warn('[DELETED_FILES_RECORD_ERROR] Fail-open:', err);
    }
  }

  /**
   * Retrieves the list of deleted files for the dedicated Admin "Berkas Terhapus" tab.
   */
  public async getDeletedFiles(limit = 100): Promise<DeletedFileRecord[]> {
    const redis = this.getRedis();
    if (!redis) {
      return inMemoryStore.get(limit);
    }

    try {
      const ids: string[] = await redis.zrange(DELETED_FILES_INDEX, 0, limit - 1, { rev: true });
      if (!ids || ids.length === 0) {
        return inMemoryStore.get(limit);
      }

      const keys = ids.map((id) => `${DELETED_FILE_PREFIX}${id}`);
      const rawObjects = await redis.mget<string[]>(...keys);

      const result: DeletedFileRecord[] = [];
      rawObjects.forEach((raw, idx) => {
        if (raw) {
          try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            result.push(parsed as DeletedFileRecord);
          } catch {
            // Ignore parse errors
          }
        } else {
          // Fallback to in-memory if redis object key expired
          const mem = inMemoryStore.get(limit).find((r) => r.id === ids[idx]);
          if (mem) result.push(mem);
        }
      });

      return result;
    } catch (err) {
      console.warn('[DELETED_FILES_GET_ERROR] Fallback to in-memory:', err);
      return inMemoryStore.get(limit);
    }
  }

  /**
   * Clears all deletion log records from the archive.
   */
  public async clearAll(): Promise<number> {
    inMemoryStore.clear();
    const redis = this.getRedis();
    if (!redis) return 0;

    try {
      const ids: string[] = await redis.zrange(DELETED_FILES_INDEX, 0, -1);
      if (ids && ids.length > 0) {
        const keys = ids.map((id) => `${DELETED_FILE_PREFIX}${id}`);
        const pipeline = redis.pipeline();
        pipeline.del(DELETED_FILES_INDEX);
        for (const k of keys) {
          pipeline.del(k);
        }
        await pipeline.exec();
        return ids.length;
      }
      return 0;
    } catch (err) {
      console.warn('[DELETED_FILES_CLEAR_ERROR]:', err);
      return 0;
    }
  }

  /**
   * Checks whether a file ID is archived as deleted.
   */
  public async isDeleted(id: string): Promise<boolean> {
    if (!id) return false;
    if (inMemoryStore.isDeleted(id)) return true;

    const redis = this.getRedis();
    if (!redis) return false;

    try {
      const score = await redis.zscore(DELETED_FILES_INDEX, id);
      return score !== null && score !== undefined;
    } catch {
      return false;
    }
  }
}

export const deletedFilesRepository = new DeletedFilesRepository();

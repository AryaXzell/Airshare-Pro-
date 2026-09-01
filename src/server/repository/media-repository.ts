import { MediaObject, MediaRepository } from '../../types';
import { developmentMediaRepository } from './development-repository';
import { UpstashMediaRepository } from './upstash-repository';
import { getRedisClient, isUpstashConfigured } from '../storage/redis-client';

let cachedUpstashRepository: UpstashMediaRepository | null = null;

/**
 * Returns the appropriate repository instance based on dynamic environment configuration.
 * Re-evaluates isUpstashConfigured() on every call while reusing repository instances.
 */
export function getMediaRepository(): MediaRepository {
  if (isUpstashConfigured()) {
    const redis = getRedisClient();
    if (redis) {
      if (!cachedUpstashRepository) {
        cachedUpstashRepository = new UpstashMediaRepository(redis);
      }
      return cachedUpstashRepository;
    }
  }

  return developmentMediaRepository;
}

export { developmentMediaRepository, UpstashMediaRepository };
export type { MediaRepository, MediaObject };


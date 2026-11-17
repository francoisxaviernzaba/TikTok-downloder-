/**
 * In-memory TTL cache with size cap and negative cache support.
 * Single-instance, per-process. Swappable behind a small interface for future Redis migration.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface CacheConfig {
  ttlSeconds: number;
  negativeTtlSeconds: number;
  maxEntries: number;
}

const defaultConfig: CacheConfig = {
  ttlSeconds: Number(process.env.CACHE_TTL_SECONDS) || 1500, // 25 minutes (just under CDN expiry)
  negativeTtlSeconds: Number(process.env.NEGATIVE_TTL_SECONDS) || 60, // 1 minute for negative cache
  maxEntries: Number(process.env.CACHE_MAX_ENTRIES) || 5000,
};

const cache = new Map<string, CacheEntry<unknown>>();
const negativeCache = new Map<string, CacheEntry<true>>();

function pruneIfNeeded(map: Map<string, CacheEntry<unknown>>, maxEntries: number): void {
  if (map.size <= maxEntries) return;
  const now = Date.now();
  // First pass: remove expired
  for (const [key, entry] of map.entries()) {
    if (entry.expiresAt <= now) {
      map.delete(key);
    }
  }
  // If still over cap, remove oldest (by expiresAt)
  if (map.size > maxEntries) {
    const entries = Array.from(map.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const toRemove = entries.slice(0, map.size - maxEntries);
    for (const [key] of toRemove) {
      map.delete(key);
    }
  }
}

function pruneNegativeIfNeeded(maxEntries: number): void {
  if (negativeCache.size <= maxEntries) return;
  const now = Date.now();
  for (const [key, entry] of negativeCache.entries()) {
    if (entry.expiresAt <= now) {
      negativeCache.delete(key);
    }
  }
  if (negativeCache.size > maxEntries) {
    const entries = Array.from(negativeCache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const toRemove = entries.slice(0, negativeCache.size - maxEntries);
    for (const [key] of toRemove) {
      negativeCache.delete(key);
    }
  }
}

export function get<T>(key: string): T | undefined {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

export function set<T>(key: string, value: T, ttlSeconds?: number): void {
  const ttl = (ttlSeconds ?? defaultConfig.ttlSeconds) * 1000;
  cache.set(key, { value, expiresAt: Date.now() + ttl });
  pruneIfNeeded(cache, defaultConfig.maxEntries);
}

export function invalidate(key: string): void {
  cache.delete(key);
  negativeCache.delete(key); // also clear negative cache on explicit invalidation
}

export function negGet(key: string): boolean {
  const entry = negativeCache.get(key);
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) {
    negativeCache.delete(key);
    return false;
  }
  return true;
}

export function negSet(key: string, ttlSeconds?: number): void {
  const ttl = (ttlSeconds ?? defaultConfig.negativeTtlSeconds) * 1000;
  negativeCache.set(key, { value: true, expiresAt: Date.now() + ttl });
  pruneNegativeIfNeeded(defaultConfig.maxEntries);
}

export function clearAll(): void {
  cache.clear();
  negativeCache.clear();
}

export function getStats(): { size: number; negativeSize: number; maxEntries: number } {
  return {
    size: cache.size,
    negativeSize: negativeCache.size,
    maxEntries: defaultConfig.maxEntries,
  };
}

// Re-export helpers from resolvers/types for convenience
export { canonicalVideoId, isAllowedTikTokHost, isAllowedMediaHost } from './resolvers/types.ts';
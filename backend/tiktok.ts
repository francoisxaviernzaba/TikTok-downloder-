/**
 * Main TikTok resolution logic:
 * - Canonical video ID extraction
 * - Short-link expansion
 * - Single-flight cache-first resolution
 * - Media URL picking by kind (video|hd|music|cover|image)
 * - Allowed host validation (SSRF guard)
 */

import { get, set, invalidate, negGet, negSet } from './cache.ts';
import { canonicalVideoId, isAllowedTikTokHost, isAllowedMediaHost } from './resolvers/types.ts';
import { resolveWithChain } from './resolvers/index.ts';

type MediaKind = 'video' | 'hd' | 'music' | 'cover' | 'image';

export interface TikTokVideoData {
  id: string;
  title: string;
  cover: string;
  duration: number;
  author: {
    id: string;
    unique_id: string;
    nickname: string;
    avatar: string;
  };
  stats: {
    plays: number;
    likes: number;
    comments: number;
    shares: number;
    downloads: number;
  };
  music: {
    id: string;
    title: string;
    author: string;
    url: string;
  };
  downloads: {
    nowm: string;
    nowm_hd: string;
    watermark: string;
    music: string;
  };
  images: string[];
  isVideo: boolean;
  sourceUrl: string;
  cookies?: string;
}

// In-flight promise map for single-flight
const inFlight = new Map<string, Promise<TikTokVideoData>>();

/**
 * Expand short TikTok links (vt.tiktok.com, vm.tiktok.com) to canonical URL.
 * Reuses logic from server.ts resolveTikTokUrl.
 */
export async function expandShortLink(url: string): Promise<string> {
  const trimmed = url.trim();

  // Already canonical
  if (trimmed.includes('tiktok.com/@') && (trimmed.includes('/video/') || trimmed.includes('/photo/'))) {
    return trimmed;
  }

  // Short links
  if (trimmed.includes('vt.tiktok.com') || trimmed.includes('vm.tiktok.com')) {
    try {
      const response = await fetch(trimmed, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        },
      });
      if (response.url && (response.url.includes('/video/') || response.url.includes('/photo/'))) {
        return response.url;
      }
    } catch {
      // Fall through to original
    }
  }

  return trimmed;
}

/**
 * Resolve TikTok URL with cache-first, single-flight, and fallback chain.
 * Returns normalized TikTokVideoData with sourceUrl.
 */
export async function resolveTikTok(inputUrl: string): Promise<TikTokVideoData> {
  // 1. Expand short links first
  const expandedUrl = await expandShortLink(inputUrl);

  // 2. Derive cache key from canonical video ID
  const cacheKey = canonicalVideoId(expandedUrl);

  // 3. Check positive cache
  const cached = get<TikTokVideoData>(cacheKey);
  if (cached) {
    console.log(`[cache] HIT for ${cacheKey} (${expandedUrl})`);
    return cached;
  }

  // 4. Check negative cache
  if (negGet(cacheKey)) {
    console.log(`[cache] NEGATIVE HIT for ${cacheKey} (${expandedUrl})`);
    throw new Error('Cached failure for this URL (negative cache)');
  }

  // 5. Single-flight: check if already resolving
  const existing = inFlight.get(cacheKey);
  if (existing) {
    console.log(`[singleflight] Waiting for in-flight request for ${cacheKey}`);
    return existing;
  }

  // 6. Start resolution
  console.log(`[resolve] Starting resolution for ${cacheKey} (${expandedUrl})`);
  const promise = (async () => {
    try {
      const { data, resolverName, failures } = await resolveWithChain(expandedUrl);
      console.log(`[resolve] Success via ${resolverName} for ${cacheKey} (failures: ${failures.length})`);
      set(cacheKey, data);
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[resolve] All resolvers failed for ${cacheKey}: ${msg}`);
      negSet(cacheKey); // Short negative cache
      throw err;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

/**
 * Pick media URL by kind from resolved video data.
 * Validates index bounds for images.
 */
export function pickMediaUrl(data: TikTokVideoData, kind: MediaKind, index: number = 0): string {
  switch (kind) {
    case 'video':
      return data.downloads.nowm;
    case 'hd':
      return data.downloads.nowm_hd || data.downloads.nowm;
    case 'music':
      return data.downloads.music;
    case 'cover':
      return data.cover;
    case 'image':
      if (index >= 0 && index < data.images.length) {
        return data.images[index];
      }
      // Fallback to cover if index out of bounds
      return data.cover;
    default:
      return data.downloads.nowm;
  }
}

/**
 * Get content type for a given kind.
 */
export function getContentType(kind: MediaKind): string {
  switch (kind) {
    case 'video':
    case 'hd':
      return 'video/mp4';
    case 'music':
      return 'audio/mpeg';
    case 'cover':
    case 'image':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Get file extension for a given kind.
 */
export function getFileExtension(kind: MediaKind): string {
  switch (kind) {
    case 'video':
    case 'hd':
      return 'mp4';
    case 'music':
      return 'mp3';
    case 'cover':
    case 'image':
      return 'jpg';
    default:
      return 'bin';
  }
}

/**
 * Sanitize filename (preserves existing regex from server.ts).
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Validate that a src URL is a TikTok domain (SSRF guard for /api/download src param).
 */
export function validateSrcUrl(url: string): void {
  if (!isAllowedTikTokHost(url)) {
    throw new Error('Invalid source URL: must be a TikTok domain');
  }
}

/**
 * Validate that a media URL is from an allowed TikTok CDN host (SSRF guard).
 */
export function validateMediaUrl(url: string): void {
  if (!isAllowedMediaHost(url)) {
    throw new Error('Media URL host not allowed');
  }
}

/**
 * Invalidate cache entry for a source URL (used on 401/403/410 re-resolve).
 */
export function invalidateCacheForUrl(url: string): void {
  const expanded = canonicalVideoId(url);
  invalidate(expanded);
  console.log(`[cache] Invalidated ${expanded}`);
}
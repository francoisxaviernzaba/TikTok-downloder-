/**
 * Resolver types and shared helpers for TikTok video extraction.
 * All resolvers normalize to NormalizedTikTok (src/types.ts TikTokVideoData + required sourceUrl).
 */

import type { TikTokVideoData, TikTokAuthor, TikTokStats, TikTokMusic, TikTokDownloads } from '../../src/types.ts';

/** Normalized resolver output: a TikTokVideoData with a guaranteed canonical sourceUrl. */
export type NormalizedTikTok = TikTokVideoData & { sourceUrl: string };

/**
 * Reject empty/skeleton results (e.g. a removed/private video page that still
 * returns a bare itemStruct) so the chain can fall through to the next resolver.
 */
export function isUsableTikTokData(d: NormalizedTikTok | null | undefined): boolean {
  if (!d || !d.id) return false;
  const hasMedia = !!d.downloads?.nowm || (Array.isArray(d.images) && d.images.length > 0);
  const hasIdentity =
    (!!d.title && d.title !== 'Untitled TikTok Video') ||
    (!!d.author?.unique_id && d.author.unique_id !== 'unknown');
  return hasMedia && hasIdentity;
}

export interface Resolver {
  name: string;
  resolve(inputUrl: string): Promise<NormalizedTikTok>;
}

export interface FetchWithTimeoutOptions extends Omit<RequestInit, 'headers' | 'signal'> {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * Fetch with AbortController timeout.
 * Returns response even on HTTP errors; only throws on network/timeout/abort.
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeoutMs = 15000, headers = {}, ...init } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: '*/*',
        ...headers,
      },
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Normalize author info from various resolver responses.
 */
export function normalizeAuthor(data: Record<string, unknown>): TikTokAuthor {
  const author = (data.author as Record<string, unknown>) || {};
  return {
    id: String(author.id || author.uid || ''),
    unique_id: String(author.unique_id || author.uniqueId || author.username || author.sec_uid || 'unknown'),
    nickname: String(author.nickname || author.nick_name || 'TikTok Creator'),
    avatar: String(author.avatar || author.avatar_url || author.avatar_thumb || ''),
  };
}

/**
 * Normalize stats from various resolver responses.
 */
export function normalizeStats(data: Record<string, unknown>): TikTokStats {
  const stats = (data.stats as Record<string, unknown>) || data.statistics || {};
  return {
    plays: Number(stats.plays || stats.play_count || stats.playCount || stats.view_count || stats.views || 0),
    likes: Number(stats.likes || stats.digg_count || stats.diggCount || stats.like_count || 0),
    comments: Number(stats.comments || stats.comment_count || stats.commentCount || 0),
    shares: Number(stats.shares || stats.share_count || stats.shareCount || 0),
    downloads: Number(stats.downloads || stats.download_count || 0),
  };
}

/**
 * Normalize music info from various resolver responses.
 */
export function normalizeMusic(data: Record<string, unknown>): TikTokMusic {
  const music = (data.music as Record<string, unknown>) || (data.music_info as Record<string, unknown>) || {};
  return {
    id: String(music.id || music.mid || ''),
    title: String(music.title || music.music_name || data.music || 'Original Sound'),
    author: String(music.author || music.owner_name || music.author_name || ''),
    url: String(music.play_url || music.playUrl || music.url || data.music || ''),
  };
}

/**
 * Normalize download URLs from various resolver responses.
 * Returns empty strings for missing fields (downstream will pick by kind).
 */
export function normalizeDownloads(data: Record<string, unknown>): TikTokDownloads {
  const dl = (data.downloads as Record<string, unknown>) || data;
  return {
    nowm: String(dl.nowm || dl.no_watermark || dl.play || dl.video_no_watermark || dl.play_addr || ''),
    nowm_hd: String(dl.nowm_hd || dl.hdplay || dl.hd_play || dl.video_hd_no_watermark || dl.nowm || ''),
    watermark: String(dl.watermark || dl.wmplay || dl.play_watermark || ''),
    music: String(dl.music || dl.music_play_url || dl.audio || ''),
  };
}

/**
 * Extract canonical TikTok video ID from a URL.
 * Handles: tiktok.com/@user/video/ID, tiktok.com/@user/photo/ID, vm.tiktok.com/..., vt.tiktok.com/..., tiktok.com/t/ID.
 */
export function canonicalVideoId(url: string): string {
  try {
    const u = new URL(url);
    // Standard: /video/ID or /photo/ID
    const videoMatch = u.pathname.match(/\/(video|photo)\/(\d+)/);
    if (videoMatch) return videoMatch[2];

    // Short paths: /t/ID, /v/ID
    const shortMatch = u.pathname.match(/\/(t|v)\/([A-Za-z0-9]+)/);
    if (shortMatch) return shortMatch[2];

    // Fallback: last numeric segment
    const parts = u.pathname.split('/').filter(Boolean);
    const lastNumeric = parts.reverse().find((p) => /^\d+$/.test(p));
    if (lastNumeric) return lastNumeric;
  } catch {
    // Ignore URL parsing errors
  }
  // Final fallback: hash of URL
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  }
  return `vid_${Math.abs(hash).toString(36)}`;
}

/**
 * Check if a host is a known TikTok CDN domain.
 * Used for SSRF guard on media URLs.
 */
export function isAllowedMediaHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const allowedHosts = [
      'tiktokcdn.com',
      'tiktokcdn-eu.com',
      'tiktokcdn-us.com',
      'tiktokv.com',
      'tiktokv-eu.com',
      'tiktokv-us.com',
      'muscdn.com',
      'byteoversea.com',
      'ibytedtos.com',
      'akamaized.net',
      'bytecdn.cn',
      'tiktok.com',
    ];
    return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

/**
 * Check if a URL host is a TikTok domain (for src parameter SSRF guard).
 */
export function isAllowedTikTokHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const allowedHosts = ['tiktok.com', 'vt.tiktok.com', 'vm.tiktok.com', 'm.tiktok.com'];
    return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}
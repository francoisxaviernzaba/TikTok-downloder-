/**
 * Direct TikTok scraper resolver.
 * 1. Follow redirects to canonical tiktok.com/(video|photo)/<id>
 * 2. Fetch page HTML (desktop UA, then mobile UA fallback)
 * 3. Extract <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
 * 4. Parse __DEFAULT_SCOPE__["webapp.video-detail"].itemInfo.itemStruct
 * 5. Extract no-watermark URL, images, music, stats, author
 * 6. Validate media host is allowed TikTok CDN
 */

import { fetchWithTimeout, canonicalVideoId, isAllowedMediaHost } from './types.ts';
import type { Resolver, NormalizedTikTok } from './types.ts';

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

interface TikTokItemStruct {
  id: string;
  desc: string;
  createTime: number;
  video?: {
    id: string;
    playAddr: string;
    downloadAddr: string;
    cover: string;
    originCover: string;
    duration: number;
    width: number;
    height: number;
    bitrateInfo?: Array<{
      GearName?: string;
      Bitrate?: number;
      PlayAddr?: {
        UrlList?: string[];
        Width?: number;
        Height?: number;
        DataSize?: string;
      };
    }>;
  };
  imagePost?: {
    images: Array<{
      imageURL: {
        urlList: string[];
      };
    }>;
  };
  music?: {
    id: string;
    title: string;
    author: string;
    playUrl: string;
    coverThumb: string;
    coverMedium: string;
    coverLarge: string;
  };
  author: {
    id: string;
    uniqueId: string;
    nickname: string;
    avatarThumb: string;
    avatarMedium: string;
    avatarLarger: string;
  };
  stats: {
    diggCount: number;
    shareCount: number;
    commentCount: number;
    playCount: number;
    collectCount: number;
  };
}

function extractUniversalData(html: string): Record<string, unknown> | null {
  // Look for the script tag with id="__UNIVERSAL_DATA_FOR_REHYDRATION__"
  const scriptMatch = html.match(
    /<script\s+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"\s+type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!scriptMatch?.[1]) return null;

  try {
    return JSON.parse(scriptMatch[1]);
  } catch {
    return null;
  }
}

function findItemStruct(data: Record<string, unknown>): TikTokItemStruct | null {
  // Navigate: __DEFAULT_SCOPE__["webapp.video-detail"].itemInfo.itemStruct
  const defaultScope = (data.__DEFAULT_SCOPE__ as Record<string, unknown>) || {};
  const videoDetail = (defaultScope['webapp.video-detail'] as Record<string, unknown>) || {};
  const itemInfo = (videoDetail.itemInfo as Record<string, unknown>) || {};
  const itemStruct = itemInfo.itemStruct as Record<string, unknown> | undefined;

  if (!itemStruct) return null;

  // Validate required fields
  if (!itemStruct.id || !itemStruct.author) return null;
  // A bare skeleton (removed/private video) has neither video nor imagePost
  if (!itemStruct.video && !itemStruct.imagePost) return null;

  return itemStruct as unknown as TikTokItemStruct;
}

function cleanMediaUrl(url: string): string {
  // Only strip the cache-buster param. NEVER strip signature/auth params
  // (signature, sig, x-expires, etc.) — they are required for the CDN to accept the request.
  try {
    const u = new URL(url);
    u.searchParams.delete('_rticket');
    return u.toString();
  } catch {
    return url;
  }
}

function validateMediaUrl(url: string): boolean {
  if (!url) return false;
  if (!isAllowedMediaHost(url)) return false;
  try {
    const u = new URL(url);
    // Basic check: should be http/https
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    return true;
  } catch {
    return false;
  }
}

function getCookiesFromResponse(response: Response): string {
  const headers = response.headers as unknown as { getSetCookie?: () => string[] };
  let raw: string[] = [];
  if (typeof headers.getSetCookie === 'function') {
    raw = headers.getSetCookie();
  } else {
    const sc = response.headers.get('set-cookie');
    if (sc) raw = [sc];
  }
  return raw.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
}

async function fetchPageHtml(url: string, userAgent: string): Promise<{ html: string; cookies: string }> {
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
    timeoutMs: Number(process.env.RESOLVER_TIMEOUT_MS) || 10000,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return { html: await response.text(), cookies: getCookiesFromResponse(response) };
}

function buildTikTokVideoData(item: TikTokItemStruct, sourceUrl: string, cookies: string): NormalizedTikTok {
  const isVideo = !!item.video;
  const images: string[] = [];

  if (!isVideo && item.imagePost?.images) {
    for (const img of item.imagePost.images) {
      const url = img.imageURL?.urlList?.[0];
      if (url && validateMediaUrl(url)) {
        images.push(cleanMediaUrl(url));
      }
    }
  }

  // TikTok's downloadAddr is the WATERMARKED download; playAddr and bitrateInfo are the
  // clean playback streams. Prefer the clean streams for no-watermark output.
  let nowm = '';
  let nowm_hd = '';
  let watermark = '';

  // Best clean adaptive playback URL (highest bitrate wins).
  let bestAdaptive = '';
  let bestScore = -1;
  const bitrateInfo = Array.isArray(item.video?.bitrateInfo) ? item.video!.bitrateInfo! : [];
  for (const b of bitrateInfo) {
    const list = b?.PlayAddr?.UrlList;
    const url = Array.isArray(list) ? list.find((u) => typeof u === 'string' && validateMediaUrl(u)) : undefined;
    if (!url) continue;
    const score = Number(b?.Bitrate || 0) || Number(b?.PlayAddr?.Width || 0) * Number(b?.PlayAddr?.Height || 0) || 0;
    if (score > bestScore) {
      bestScore = score;
      bestAdaptive = cleanMediaUrl(url);
    }
  }

  const playAddr =
    item.video?.playAddr && validateMediaUrl(item.video.playAddr) ? cleanMediaUrl(item.video.playAddr) : '';
  const downloadAddr =
    item.video?.downloadAddr && validateMediaUrl(item.video.downloadAddr)
      ? cleanMediaUrl(item.video.downloadAddr)
      : '';

  // Clean default: playAddr, else best adaptive, else (last resort) downloadAddr.
  nowm = playAddr || bestAdaptive || downloadAddr;
  // Clean HD: best adaptive, else playAddr.
  nowm_hd = bestAdaptive || playAddr || nowm;
  // Watermarked URL kept for reference only.
  watermark = downloadAddr && downloadAddr !== nowm ? downloadAddr : '';

  // Music
  let musicUrl = '';
  if (item.music?.playUrl && validateMediaUrl(item.music.playUrl)) {
    musicUrl = cleanMediaUrl(item.music.playUrl);
  }

  const downloads = {
    nowm,
    nowm_hd: nowm_hd || nowm,
    watermark,
    music: musicUrl,
  };

  const cover = item.video?.originCover || item.video?.cover || '';

  return {
    id: item.id,
    title: item.desc || 'Untitled TikTok Video',
    cover: validateMediaUrl(cover) ? cleanMediaUrl(cover) : '',
    duration: item.video?.duration || 0,
    author: {
      id: item.author.id,
      unique_id: item.author.uniqueId,
      nickname: item.author.nickname,
      avatar: item.author.avatarLarger || item.author.avatarMedium || item.author.avatarThumb || '',
    },
    stats: {
      plays: item.stats.playCount,
      likes: item.stats.diggCount,
      comments: item.stats.commentCount,
      shares: item.stats.shareCount,
      downloads: 0, // Not available from page
    },
    music: {
      id: item.music?.id || '',
      title: item.music?.title || 'Original Sound',
      author: item.music?.author || '',
      url: musicUrl,
    },
    downloads,
    images,
    isVideo,
    sourceUrl,
    cookies,
  };
}

export const directResolver: Resolver = {
  name: 'direct',
  async resolve(inputUrl: string): Promise<NormalizedTikTok> {
    // Step 1: Follow redirects to canonical URL
    let canonicalUrl = inputUrl;
    try {
      const response = await fetchWithTimeout(inputUrl, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'User-Agent': DESKTOP_UA },
        timeoutMs: Number(process.env.RESOLVER_TIMEOUT_MS) || 10000,
      });
      if (response.url && response.url.includes('tiktok.com') && (response.url.includes('/video/') || response.url.includes('/photo/'))) {
        canonicalUrl = response.url;
      }
    } catch {
      // Keep original URL if redirect fails
    }

    // Step 2: Fetch HTML with desktop UA, then mobile UA fallback
    let html: string;
    let cookies = '';
    try {
      const page = await fetchPageHtml(canonicalUrl, DESKTOP_UA);
      html = page.html;
      cookies = page.cookies;
    } catch {
      // Fallback to mobile UA
      const page = await fetchPageHtml(canonicalUrl, MOBILE_UA);
      html = page.html;
      cookies = page.cookies;
    }

    // Step 3: Extract universal data
    const universalData = extractUniversalData(html);
    if (!universalData) {
      throw new Error('Could not extract __UNIVERSAL_DATA_FOR_REHYDRATION__ from page');
    }

    // Step 4: Find itemStruct
    const itemStruct = findItemStruct(universalData);
    if (!itemStruct) {
      throw new Error('Video data not found (private, removed, or page structure changed)');
    }

    // Step 5: Build normalized response
    return buildTikTokVideoData(itemStruct, canonicalUrl, cookies);
  },
};
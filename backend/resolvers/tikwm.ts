/**
 * TikWM resolver - ports existing extractTikTokData logic from server.ts.
 * POST https://tikwm.com/api/ with form data: url, hd=1
 */

import { fetchWithTimeout, normalizeAuthor, normalizeStats, normalizeMusic, normalizeDownloads, canonicalVideoId } from './types.ts';
import type { Resolver, NormalizedTikTok } from './types.ts';

const TIKWM_API_URL = process.env.RESOLVER_TIKWM_URL || 'https://tikwm.com/api/';

function buildTikTokVideoData(data: Record<string, unknown>, sourceUrl: string): NormalizedTikTok {
  const images = Array.isArray(data.images) ? (data.images as string[]) : [];
  const downloads = normalizeDownloads(data);

  return {
    id: String(data.id || canonicalVideoId(sourceUrl)),
    title: String(data.title || 'Untitled TikTok Video'),
    cover: String(data.cover || data.origin_cover || ''),
    duration: Number(data.duration || 0),
    author: normalizeAuthor(data),
    stats: normalizeStats(data),
    music: normalizeMusic(data),
    downloads,
    images,
    isVideo: images.length === 0,
    sourceUrl,
  };
}

export const tikwmResolver: Resolver = {
  name: 'tikwm',
  async resolve(inputUrl: string): Promise<NormalizedTikTok> {
    const encodedParams = new URLSearchParams();
    encodedParams.set('url', inputUrl);
    encodedParams.set('hd', '1');

    const response = await fetchWithTimeout(TIKWM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Cookie: 'current_language=en',
      },
      body: encodedParams.toString(),
      timeoutMs: Number(process.env.RESOLVER_TIMEOUT_MS) || 8000,
    });

    if (!response.ok) {
      throw new Error(`TikWM upstream returned HTTP ${response.status}`);
    }

    const json = await response.json();

    if (json.code !== 0 || !json.data) {
      const msg = json.msg || 'Failed to extract video details from TikWM';
      // Treat daily quota as a specific error for observability
      if (msg.includes('10000 request') || msg.includes('quota') || msg.includes('limit')) {
        throw new Error(`TikWM quota exhausted: ${msg}`);
      }
      throw new Error(msg);
    }

    return buildTikTokVideoData(json.data, inputUrl);
  },
};
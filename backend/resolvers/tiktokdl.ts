/**
 * tiktokdownload.online resolver.
 *
 * This provider streams the MP4 directly (no JSON metadata), so we enrich metadata
 * from TikTok's oEmbed endpoint (title, author, thumbnail) and point downloads at
 * the provider's /api/download URL. Lower bitrate than the direct scraper, but a
 * useful fallback when TikTok blocks the server IP.
 *
 * Override the endpoint with RESOLVER_TIKTOKDL_URL.
 */

import { fetchWithTimeout, canonicalVideoId } from './types.ts';
import type { Resolver, NormalizedTikTok } from './types.ts';

const TIKTOKDL_URL = process.env.RESOLVER_TIKTOKDL_URL || 'https://tiktokdownload.online/api/download';

interface OEmbed {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
}

function handleFromUrl(u: string): string {
  const m = u.match(/\/@([^/?#]+)/);
  return m ? m[1] : 'unknown';
}

async function fetchOEmbed(inputUrl: string, timeoutMs: number): Promise<OEmbed> {
  try {
    const res = await fetchWithTimeout('https://www.tiktok.com/oembed?url=' + encodeURIComponent(inputUrl), {
      headers: { Accept: 'application/json' },
      timeoutMs,
    });
    if (!res.ok) return {};
    const json = (await res.json()) as OEmbed;
    return json && typeof json === 'object' ? json : {};
  } catch {
    return {};
  }
}

export const tiktokdlResolver: Resolver = {
  name: 'tiktokdl',
  async resolve(inputUrl: string): Promise<NormalizedTikTok> {
    const timeoutMs = Number(process.env.RESOLVER_TIMEOUT_MS) || 8000;
    const oembed = await fetchOEmbed(inputUrl, timeoutMs);
    const handle = (oembed.author_url && handleFromUrl(oembed.author_url)) || handleFromUrl(inputUrl);
    const mediaUrl = `${TIKTOKDL_URL}?url=${encodeURIComponent(inputUrl)}`;

    return {
      id: canonicalVideoId(inputUrl),
      title: oembed.title || 'Untitled TikTok Video',
      cover: oembed.thumbnail_url || '',
      duration: 0,
      author: {
        id: '',
        unique_id: handle,
        nickname: oembed.author_name || handle,
        avatar: '',
      },
      stats: { plays: 0, likes: 0, comments: 0, shares: 0, downloads: 0 },
      music: { id: '', title: 'Original Sound', author: '', url: '' },
      downloads: {
        nowm: mediaUrl,
        nowm_hd: mediaUrl,
        watermark: '',
        music: '',
      },
      images: [],
      isVideo: true,
      sourceUrl: inputUrl,
    };
  },
};
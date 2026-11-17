/**
 * Tikly resolver - GET https://tiklydown.eu.org/api/download?url=<url>
 * Maps response to TikTokVideoData.
 * Response shape (observed): { data: { video: { no_watermark, watermark, cover }, images: [], music, author, statistics, ... } }
 */

import { fetchWithTimeout, normalizeAuthor, normalizeStats, normalizeMusic, canonicalVideoId } from './types.ts';
import type { Resolver, NormalizedTikTok } from './types.ts';

const TIKLY_API_URL = process.env.RESOLVER_TIKLY_URL || 'https://tiklydown.eu.org/api/download';

function buildTikTokVideoData(data: Record<string, unknown>, sourceUrl: string): NormalizedTikTok {
  const video = (data.video as Record<string, unknown>) || {};
  const imagesData = (data.images as unknown[]) || (data.image_post as unknown[]) || [];
  const images = imagesData.map((img) => {
    if (typeof img === 'string') return img;
    const imgObj = img as Record<string, unknown>;
    return String(imgObj.url || imgObj.image_url || imgObj.imageURL || '');
  }).filter(Boolean);

  const downloads = {
    nowm: String(video.no_watermark || video.play_addr || video.download_url || ''),
    nowm_hd: String(video.hd_play || video.hdplay || video.no_watermark || ''),
    watermark: String(video.watermark || video.play_watermark || ''),
    music: String(data.music || (data.music_info as Record<string, unknown>)?.play_url || ''),
  };

  return {
    id: String(data.id || data.aweme_id || canonicalVideoId(sourceUrl)),
    title: String(data.title || data.desc || data.description || 'Untitled TikTok Video'),
    cover: String(video.cover || video.origin_cover || data.cover || ''),
    duration: Number(data.duration || video.duration || 0),
    author: normalizeAuthor(data),
    stats: normalizeStats(data),
    music: normalizeMusic(data),
    downloads,
    images,
    isVideo: images.length === 0,
    sourceUrl,
  };
}

export const tiklyResolver: Resolver = {
  name: 'tikly',
  async resolve(inputUrl: string): Promise<NormalizedTikTok> {
    const url = `${TIKLY_API_URL}?url=${encodeURIComponent(inputUrl)}`;

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      timeoutMs: Number(process.env.RESOLVER_TIMEOUT_MS) || 8000,
    });

    if (!response.ok) {
      throw new Error(`Tikly upstream returned HTTP ${response.status}`);
    }

    const json = await response.json();

    // Tikly returns { code: 0, data: {...} } or { success: true, data: {...} }
    if ((json.code !== undefined && json.code !== 0) || json.success === false) {
      throw new Error(json.msg || json.message || 'Failed to extract video details from Tikly');
    }

    const data = json.data || json;
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      throw new Error('Tikly returned empty data');
    }

    return buildTikTokVideoData(data, inputUrl);
  },
};
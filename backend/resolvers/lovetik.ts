/**
 * LoveTik resolver - POST https://lovetik.com/api/ajax/search with form data: url=<url>
 * Normalizes response to TikTokVideoData.
 */

import { fetchWithTimeout, normalizeAuthor, normalizeStats, normalizeMusic, canonicalVideoId } from './types.ts';
import type { Resolver, NormalizedTikTok } from './types.ts';

const LOVETIK_API_URL = process.env.RESOLVER_LOVETIK_URL || 'https://lovetik.com/api/ajax/search';

function buildTikTokVideoData(data: Record<string, unknown>, sourceUrl: string): NormalizedTikTok {
  // LoveTik response structure varies; try multiple known field patterns
  const videoData = (data.data as Record<string, unknown>) || data;
  const video = (videoData.video as Record<string, unknown>) || (videoData.video_data as Record<string, unknown>) || {};
  const imagesData = (videoData.images as unknown[]) || (videoData.image_post as unknown[]) || [];
  
  const images = imagesData.map((img) => {
    if (typeof img === 'string') return img;
    const imgObj = img as Record<string, unknown>;
    return String(imgObj.url || imgObj.image_url || imgObj.imageURL || imgObj.image_url_no_watermark || '');
  }).filter(Boolean);

  const downloads = {
    nowm: String(
      video.no_watermark ||
      video.download_url ||
      video.play_addr ||
      video.play ||
      videoData.play ||
      ''
    ),
    nowm_hd: String(
      video.hd_play ||
      video.hdplay ||
      video.hd_download_url ||
      video.no_watermark ||
      videoData.hdplay ||
      ''
    ),
    watermark: String(
      video.watermark ||
      video.play_watermark ||
      video.wm_play ||
      videoData.wmplay ||
      ''
    ),
    music: String(
      videoData.music ||
      (videoData.music_info as Record<string, unknown>)?.play_url ||
      (videoData.music as Record<string, unknown>)?.play_url ||
      ''
    ),
  };

  return {
    id: String(videoData.id || videoData.aweme_id || videoData.video_id || canonicalVideoId(sourceUrl)),
    title: String(videoData.title || videoData.desc || videoData.description || 'Untitled TikTok Video'),
    cover: String(video.cover || video.origin_cover || videoData.cover || videoData.origin_cover || ''),
    duration: Number(videoData.duration || video.duration || 0),
    author: normalizeAuthor(videoData),
    stats: normalizeStats(videoData),
    music: normalizeMusic(videoData),
    downloads,
    images,
    isVideo: images.length === 0,
    sourceUrl,
  };
}

export const lovetikResolver: Resolver = {
  name: 'lovetik',
  async resolve(inputUrl: string): Promise<NormalizedTikTok> {
    const encodedParams = new URLSearchParams();
    encodedParams.set('url', inputUrl);

    const response = await fetchWithTimeout(LOVETIK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: encodedParams.toString(),
      timeoutMs: Number(process.env.RESOLVER_TIMEOUT_MS) || 8000,
    });

    if (!response.ok) {
      throw new Error(`LoveTik upstream returned HTTP ${response.status}`);
    }

    const json = await response.json();

    // LoveTik typically returns { status: "success", data: {...} } or { success: true, data: {...} }
    if (json.status === 'error' || json.success === false) {
      throw new Error(json.message || json.msg || 'Failed to extract video details from LoveTik');
    }

    const data = json.data || json;
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      throw new Error('LoveTik returned empty data');
    }

    return buildTikTokVideoData(data, inputUrl);
  },
};
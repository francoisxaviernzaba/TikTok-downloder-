/**
 * Generic env-driven JSON resolver.
 *
 * Lets you add many public TikTok APIs without touching code. Configure one or more
 * providers via the RESOLVER_GENERIC env var as a JSON array:
 *
 *   RESOLVER_GENERIC='[
 *     {"name":"foo","url":"https://api.foo.com/download?url={url}"},
 *     {"name":"bar","url":"https://api.bar.com/api","method":"POST",
 *      "body":"url={url}","contentType":"application/x-www-form-urlencoded"}
 *   ]'
 *
 * Placeholders: {url} = URL-encoded target URL, {urlenc} = same.
 * For POST, {url} in the body is the raw URL and {urlenc} is the encoded URL.
 *
 * The normalizer understands the common response shapes:
 *   data.video.{no_watermark,play,play_addr,hd_play,...} | data.{play,url,nowm,hdplay,...}
 *   data.images | data.image_post | data.music | data.author | data.stats | data.cover
 */

import { fetchWithTimeout, normalizeAuthor, normalizeStats, normalizeMusic, canonicalVideoId } from './types.ts';
import type { Resolver, NormalizedTikTok } from './types.ts';

export interface GenericProviderConfig {
  name: string;
  url: string;
  method?: 'GET' | 'POST';
  body?: string;
  contentType?: string;
  headers?: Record<string, string>;
}

function firstString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function normalizeGeneric(json: unknown, inputUrl: string): NormalizedTikTok {
  const root = asRecord(json);
  const data = asRecord(root.data ?? root);
  const video = asRecord(data.video ?? data.video_data);
  const musicObj = asRecord(data.music ?? data.music_info);

  const imagesRaw = data.images ?? data.image_post ?? data.imagePost ?? [];
  const images: string[] = Array.isArray(imagesRaw)
    ? imagesRaw
        .map((img) => {
          if (typeof img === 'string') return img;
          const rec = asRecord(img);
          const urlList = rec.url_list;
          return firstString(
            rec.url,
            rec.image_url,
            rec.imageURL,
            Array.isArray(urlList) ? urlList[0] : ''
          );
        })
        .filter(Boolean)
    : [];

  const cover = firstString(data.cover, data.origin_cover, data.originCover, video.cover, video.origin_cover);
  const title = firstString(data.title, data.desc, data.description, data.caption);
  const id = String(data.id || data.aweme_id || data.video_id || canonicalVideoId(inputUrl));

  const nowm = firstString(
    video.no_watermark,
    video.nowm,
    video.play,
    video.play_addr,
    video.playAddr,
    video.download_url,
    video.hd_play,
    video.hdplay,
    data.nowm,
    data.no_watermark,
    data.play,
    data.play_addr,
    data.url,
    data.video_url,
    data.video,
    data.download,
    data.hdplay
  );

  const nowmHd = firstString(video.hd_play, video.hdplay, video.hd_download_url, data.hdplay, data.hd_play) || nowm;

  const musicUrl = typeof data.music === 'string' ? data.music : firstString(musicObj.play_url, musicObj.playUrl, musicObj.url);

  const author = normalizeAuthor(data);

  return {
    id,
    title: title || 'Untitled TikTok Video',
    cover,
    duration: Number(data.duration || video.duration || 0),
    author,
    stats: normalizeStats(data),
    music: normalizeMusic(data),
    downloads: {
      nowm,
      nowm_hd: nowmHd,
      watermark: firstString(video.watermark, video.play_watermark, data.watermark),
      music: musicUrl,
    },
    images,
    isVideo: images.length === 0,
    sourceUrl: inputUrl,
  };
}

export function createGenericResolver(config: GenericProviderConfig): Resolver {
  const method = (config.method || 'GET').toUpperCase();
  const timeoutMs = Number(process.env.RESOLVER_TIMEOUT_MS) || 8000;

  return {
    name: config.name,
    async resolve(inputUrl: string): Promise<NormalizedTikTok> {
      const enc = encodeURIComponent(inputUrl);
      let endpoint = config.url.includes('{url}') ? config.url.replace('{url}', enc) : config.url;
      if (method === 'GET' && !config.url.includes('{url}') && !endpoint.includes('url=')) {
        endpoint += (endpoint.includes('?') ? '&' : '?') + 'url=' + enc;
      }

      const headers: Record<string, string> = { ...(config.headers || {}) };
      let body: string | undefined;

      if (method === 'POST') {
        const template = config.body || 'url={url}';
        body = template.replace(/\{urlenc\}/g, enc).replace(/\{url\}/g, inputUrl);
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = config.contentType || 'application/x-www-form-urlencoded';
        }
      }

      const response = await fetchWithTimeout(endpoint, { method, headers, body, timeoutMs });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();
      const data = normalizeGeneric(json, inputUrl);
      if (!data.downloads.nowm && data.images.length === 0) {
        throw new Error('no media URL in response');
      }
      return data;
    },
  };
}

/** Parse the RESOLVER_GENERIC env var (JSON array) into resolver instances. */
export function parseGenericProviders(raw?: string): Resolver[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn('[resolvers] RESOLVER_GENERIC is not a JSON array; ignoring');
      return [];
    }
    const providers = parsed
      .filter((c): c is GenericProviderConfig => !!c && typeof c.name === 'string' && typeof c.url === 'string')
      .map((c) => createGenericResolver(c));
    if (providers.length) {
      console.log(`[resolvers] loaded ${providers.length} generic provider(s): ${providers.map((p) => p.name).join(', ')}`);
    }
    return providers;
  } catch (err) {
    console.warn('[resolvers] failed to parse RESOLVER_GENERIC:', err instanceof Error ? err.message : err);
    return [];
  }
}
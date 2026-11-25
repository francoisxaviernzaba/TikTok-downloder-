/**
 * Multi-backend extraction for the TikTok Downloader website.
 *
 * Dispatches by URL domain to the right public API. Each backend normalizes
 * to the shared VideoData shape that the frontend expects.
 *
 * Backends:
 * - YouTube: Invidious → Piped fallback
 * - Twitter/X: Syndication API
 * - Reddit: .json API
 * - Vimeo: oembed
 * - Dailymotion: Graph API
 * - Cobalt: TikTok, Instagram (self-hosted, no IP blocking)
 */

export interface DownloadVariant {
  quality: string;
  watermark: boolean;
  size?: number;
  url: string;
}

export interface VideoData {
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
  /** Which backend handled this (for debugging). */
  backend?: string;
}

/** Which backend should handle this URL? */
export function backendForUrl(url: string): string | null {
  const host = hostOf(url);
  if (!host) return null;
  if (isYouTube(host)) return 'youtube';
  if (isTwitter(host)) return 'twitter';
  if (isReddit(host)) return 'reddit';
  if (isVimeo(host)) return 'vimeo';
  if (isDailymotion(host)) return 'dailymotion';
  if (isTikTok(host)) return 'tiktok';
  if (isInstagram(host)) return 'cobalt';
  return null;
}

function hostOf(url: string): string | null {
  const m = url.match(/^https?:\/\/([^/?#]+)/i);
  return m ? m[1].toLowerCase().split(':')[0] : null;
}

function isYouTube(h: string): boolean {
  return h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'youtu.be' || h.endsWith('.youtu.be');
}
function isTwitter(h: string): boolean {
  return h === 'twitter.com' || h.endsWith('.twitter.com') || h === 'x.com' || h.endsWith('.x.com');
}
function isReddit(h: string): boolean {
  return h === 'reddit.com' || h.endsWith('.reddit.com') || h === 'redd.it';
}
function isVimeo(h: string): boolean {
  return h === 'vimeo.com' || h.endsWith('.vimeo.com') || h === 'player.vimeo.com';
}
function isDailymotion(h: string): boolean {
  return h === 'dailymotion.com' || h.endsWith('.dailymotion.com') || h === 'dai.ly';
}
function isTikTok(h: string): boolean {
  return h === 'tiktok.com' || h.endsWith('.tiktok.com') || h === 'vt.tiktok.com' || h === 'vm.tiktok.com';
}
function isInstagram(h: string): boolean {
  return h === 'instagram.com' || h.endsWith('.instagram.com');
}

/** Dispatch to the right backend. */
export async function extractVideo(url: string, env: Record<string, string | undefined>): Promise<VideoData> {
  const backend = backendForUrl(url);
  if (!backend) {
    throw new Error('Unsupported URL. Supports YouTube, Twitter/X, Reddit, Vimeo, Dailymotion, TikTok, Instagram.');
  }

  let data: VideoData;
  switch (backend) {
    case 'youtube': data = await extractYouTube(url); break;
    case 'twitter': data = await extractTwitter(url); break;
    case 'reddit': data = await extractReddit(url); break;
    case 'vimeo': data = await extractVimeo(url); break;
    case 'dailymotion': data = await extractDailymotion(url); break;
    case 'tiktok': data = await extractTikTok(url); break;
    case 'cobalt': data = await extractCobalt(url, env); break;
    default: throw new Error(`Unknown backend: ${backend}`);
  }

  data.backend = backend;
  return data;
}

// ---------------------------------------------------------------------------
// YouTube — Invidious → Piped fallback
// ---------------------------------------------------------------------------

async function extractYouTube(url: string): Promise<VideoData> {
  const id = extractYouTubeId(url);
  if (!id) throw new Error('Could not extract YouTube video ID');

  const invidious = ['https://inv.nadeko.net', 'https://invidious.nerdvpn.de', 'https://yewtu.be'];
  for (const base of invidious) {
    try {
      const r = await fetch(`${base}/api/v1/videos/${id}?fields=title,videoId,author,authorId,authorThumbnails,description,thumbnail,formatStreams,adaptiveFormats`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      if (!r.ok) continue;
      const j = await r.json() as any;
      const downloads: DownloadVariant[] = [];
      for (const s of j.formatStreams || []) {
        if (s.url) downloads.push({ quality: s.qualityLabel || 'video', watermark: false, url: s.url });
      }
      for (const s of j.adaptiveFormats || []) {
        if (s.url) downloads.push({ quality: s.qualityLabel || 'audio', watermark: false, url: s.url });
      }
      const nowm = downloads.find(d => !d.watermark)?.url || '';
      const nowm_hd = downloads[0]?.url || nowm;
      return {
        id: j.videoId || id, title: j.title || 'YouTube Video', cover: j.thumbnail || '',
        duration: 0,
        author: { id: j.authorId || '', unique_id: j.authorId || 'youtube', nickname: j.author || 'YouTube Creator', avatar: j.authorThumbnails?.[0]?.url || '' },
        stats: { plays: 0, likes: 0, comments: 0, shares: 0, downloads: 0 },
        music: { id: '', title: 'Original Sound', author: j.author || '', url: '' },
        downloads: { nowm, nowm_hd, watermark: '', music: '' },
        images: [], isVideo: true,
      };
    } catch { /* try next */ }
  }

  // Piped fallback
  const piped = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de'];
  for (const base of piped) {
    try {
      const r = await fetch(`${base}/streams/${id}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!r.ok) continue;
      const j = await r.json() as any;
      const downloads: DownloadVariant[] = [];
      for (const s of j.videoStreams || []) {
        if (s.url) downloads.push({ quality: s.quality || 'video', watermark: false, url: s.url, size: s.contentLength });
      }
      for (const s of j.audioStreams || []) {
        if (s.url) downloads.push({ quality: 'audio', watermark: false, url: s.url, size: s.contentLength });
      }
      const nowm = downloads.find(d => !d.watermark)?.url || '';
      const nowm_hd = downloads[0]?.url || nowm;
      return {
        id, title: j.title || 'YouTube Video', cover: j.thumbnail || '',
        duration: 0,
        author: { id: j.uploader || '', unique_id: j.uploader || 'youtube', nickname: j.uploader || 'YouTube Creator', avatar: j.uploaderAvatar || '' },
        stats: { plays: 0, likes: 0, comments: 0, shares: 0, downloads: 0 },
        music: { id: '', title: 'Original Sound', author: j.uploader || '', url: '' },
        downloads: { nowm, nowm_hd, watermark: '', music: '' },
        images: [], isVideo: true,
      };
    } catch { /* try next */ }
  }

  throw new Error('All YouTube backends failed. The video may be private or region-locked.');
}

function extractYouTubeId(url: string): string | null {
  let m = url.match(/youtu\.be\/([^/?]+)/);
  if (m) return m[1];
  m = url.match(/[?&]v=([^/?]+)/);
  if (m) return m[1];
  m = url.match(/\/(embed|shorts|v)\/([^/?]+)/);
  if (m) return m[2];
  if (url.length === 11 && /^[a-zA-Z0-9_-]+$/.test(url)) return url;
  return null;
}

// ---------------------------------------------------------------------------
// Twitter/X — Syndication API
// ---------------------------------------------------------------------------

async function extractTwitter(url: string): Promise<VideoData> {
  const id = url.match(/\/status\/(\d+)/)?.[1];
  if (!id) throw new Error('Could not extract tweet ID');

  const r = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=a`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`Twitter syndication returned HTTP ${r.status}`);

  const j = await r.json() as any;
  const downloads: DownloadVariant[] = [];

  if (j.video?.variants) {
    const mp4s = j.video.variants
      .filter((v: any) => v.url?.endsWith('.mp4'))
      .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    for (const v of mp4s) {
      const q = v.bitrate > 2_000_000 ? '1080p' : v.bitrate > 1_000_000 ? '720p' : '480p';
      downloads.push({ quality: q, watermark: false, url: v.url });
    }
  }

  if (downloads.length === 0 && j.photos) {
    for (const p of j.photos) {
      if (p.url) downloads.push({ quality: 'image', watermark: false, url: p.url });
    }
  }

  const nowm = downloads[0]?.url || '';
  return {
    id, title: j.text || 'Tweet', cover: j.video?.poster || j.photos?.[0]?.url || '',
    duration: 0,
    author: { id: j.user?.screen_name || '', unique_id: j.user?.screen_name || 'twitter', nickname: j.user?.name || 'Twitter User', avatar: j.user?.profile_image_url_https || '' },
    stats: { plays: 0, likes: 0, comments: 0, shares: 0, downloads: 0 },
    music: { id: '', title: 'Original Sound', author: j.user?.screen_name || '', url: '' },
    downloads: { nowm, nowm_hd: nowm, watermark: '', music: '' },
    images: [], isVideo: downloads.length > 0 && downloads[0].quality !== 'image',
  };
}

// ---------------------------------------------------------------------------
// Reddit — .json API
// ---------------------------------------------------------------------------

async function extractReddit(url: string): Promise<VideoData> {
  const jsonUrl = url.endsWith('.json') ? url : `${url}.json`;
  const r = await fetch(jsonUrl, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Reddit returned HTTP ${r.status}`);

  const listing = await r.json() as any;
  const post = listing[0]?.data;
  if (!post) throw new Error('Reddit returned empty listing');

  const downloads: DownloadVariant[] = [];

  if (post.is_video && post.secure_media?.reddit_video?.fallback_url) {
    downloads.push({ quality: 'video', watermark: false, url: post.secure_media.reddit_video.fallback_url });
  }

  if (downloads.length === 0 && post.url?.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
    downloads.push({ quality: 'image', watermark: false, url: post.url });
  }

  const nowm = downloads[0]?.url || '';
  const desc = post.title + (post.selftext ? `\n\n${post.selftext}` : '');

  return {
    id: post.id, title: post.title || 'Reddit Post', cover: post.thumbnail && post.thumbnail !== 'self' ? post.thumbnail : '',
    duration: 0,
    author: { id: post.author || '', unique_id: post.author || 'reddit', nickname: post.subreddit || 'Reddit', avatar: '' },
    stats: { plays: 0, likes: 0, comments: 0, shares: 0, downloads: 0 },
    music: { id: '', title: 'Original Sound', author: post.author || '', url: '' },
    downloads: { nowm, nowm_hd: nowm, watermark: '', music: '' },
    images: [], isVideo: downloads.length > 0 && downloads[0].quality === 'video',
  };
}

// ---------------------------------------------------------------------------
// Vimeo — oembed
// ---------------------------------------------------------------------------

async function extractVimeo(url: string): Promise<VideoData> {
  const id = url.match(/vimeo\.com\/(?:channels\/[^/]+\/)?(\d+)/)?.[1] || url.match(/player\.vimeo\.com\/video\/(\d+)/)?.[1];
  if (!id) throw new Error('Could not extract Vimeo video ID');

  const r = await fetch(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${id}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`Vimeo oembed returned HTTP ${r.status}`);

  const j = await r.json() as any;
  return {
    id, title: j.title || 'Vimeo Video', cover: j.thumbnail_url || '',
    duration: j.duration || 0,
    author: { id: j.author_url || '', unique_id: j.author_url || 'vimeo', nickname: j.author_name || 'Vimeo Creator', avatar: '' },
    stats: { plays: 0, likes: 0, comments: 0, shares: 0, downloads: 0 },
    music: { id: '', title: 'Original Sound', author: j.author_name || '', url: '' },
    downloads: { nowm: '', nowm_hd: '', watermark: '', music: '' },
    images: [], isVideo: true,
  };
}

// ---------------------------------------------------------------------------
// Dailymotion — Graph API
// ---------------------------------------------------------------------------

async function extractDailymotion(url: string): Promise<VideoData> {
  const id = url.match(/\/video\/([^/_?]+)/)?.[1] || url.match(/dai\.ly\/([^/_?]+)/)?.[1];
  if (!id) throw new Error('Could not extract Dailymotion video ID');

  const r = await fetch(`https://api.dailymotion.com/video/${id}?fields=id,title,description,owner,thumbnail_480_url,url,qualities`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`Dailymotion returned HTTP ${r.status}`);

  const j = await r.json() as any;
  const downloads: DownloadVariant[] = [];

  if (j.qualities) {
    const order = ['1080', '720', '480', '380', '240', '144'];
    for (const q of order) {
      for (const s of j.qualities[q] || []) {
        if (s.url) downloads.push({ quality: `${q}p`, watermark: false, url: s.url });
      }
    }
  }

  const nowm = downloads[0]?.url || j.url || '';
  return {
    id: j.id, title: j.title || 'Dailymotion Video', cover: j.thumbnail_480_url || '',
    duration: 0,
    author: { id: j.owner?.username || '', unique_id: j.owner?.username || 'dailymotion', nickname: j.owner?.fullname || 'Dailymotion Creator', avatar: j.owner?.avatar_160_url || '' },
    stats: { plays: 0, likes: 0, comments: 0, shares: 0, downloads: 0 },
    music: { id: '', title: 'Original Sound', author: j.owner?.username || '', url: '' },
    downloads: { nowm, nowm_hd: nowm, watermark: '', music: '' },
    images: [], isVideo: true,
  };
}

// ---------------------------------------------------------------------------
// TikTok — read the direct no-watermark CDN link from the page HTML.
// The backend only fetches the page (metadata). The video file itself is
// downloaded by the user's browser from their own residential IP, because
// TikTok's CDN (v16-webapp-prime.tiktok.com) blocks datacenter IPs (403).
// ---------------------------------------------------------------------------

function decodeEscapes(s: string): string {
  return s
    .replace(/\\u002F/gi, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/')
    .replace(/\\u003D/gi, '=')
    .replace(/\\u003F/gi, '?');
}

async function extractTikTok(url: string): Promise<VideoData> {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!r.ok) throw new Error(`TikTok returned HTTP ${r.status}`);
  const html = await r.text();

  const playAddr = html.match(/"playAddr":"([^"]+)"/)?.[1];
  const downloadAddr = html.match(/"downloadAddr":"([^"]+)"/)?.[1];
  const cover = html.match(/"originCover":"([^"]+)"/)?.[1] || html.match(/"cover":"([^"]+)"/)?.[1];
  const desc = html.match(/"desc":"([^"]+)"/)?.[1];
  const uniqueId = html.match(/"uniqueId":"([^"]+)"/)?.[1];
  const nickname = html.match(/"nickname":"([^"]+)"/)?.[1];

  const nowm = playAddr ? decodeEscapes(playAddr) : '';
  const watermark = downloadAddr ? decodeEscapes(downloadAddr) : '';

  if (!nowm) {
    throw new Error('Could not find a no-watermark video URL in the TikTok page. The video may be private, region-locked, or a photo slideshow.');
  }

  const authorName = uniqueId || nickname || 'TikTok Creator';

  return {
    id: url.match(/\/video\/(\d+)/)?.[1] || url.match(/\/photo\/(\d+)/)?.[1] || 'unknown',
    title: desc || 'TikTok Video',
    cover: cover ? decodeEscapes(cover) : '',
    duration: 0,
    author: { id: uniqueId || '', unique_id: uniqueId || 'tiktok', nickname: nickname || authorName, avatar: '' },
    stats: { plays: 0, likes: 0, comments: 0, shares: 0, downloads: 0 },
    music: { id: '', title: 'Original Sound', author: authorName, url: '' },
    downloads: { nowm, nowm_hd: nowm, watermark, music: '' },
    images: [], isVideo: true,
  };
}

// ---------------------------------------------------------------------------
// Cobalt — Instagram (self-hosted; TikTok now uses extractTikTok above)
// ---------------------------------------------------------------------------

async function extractCobalt(url: string, env: Record<string, string | undefined>): Promise<VideoData> {
  const cobaltUrl = env.COBALT_API_URL;
  if (!cobaltUrl) {
    throw new Error('COBALT_API_URL is not configured. Deploy Cobalt separately and set this env var.');
  }

  const r = await fetch(`${cobaltUrl.replace(/\/$/, '')}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ url, downloadMode: 'auto', videoQuality: 'max' }),
  });
  if (!r.ok) throw new Error(`Cobalt returned HTTP ${r.status}`);

  const j = await r.json() as any;

  // Cobalt v10 statuses: tunnel | redirect | local-processing | picker | error
  if (j.status === 'error') {
    throw new Error(j.error?.code || 'Cobalt could not extract this video');
  }

  let downloadUrl = '';
  if (j.status === 'tunnel' || j.status === 'redirect') {
    downloadUrl = j.url;
  } else if (j.status === 'local-processing') {
    downloadUrl = j.tunnel?.[0] || '';
  } else if (j.status === 'picker') {
    downloadUrl = j.picker?.[0]?.url || '';
  }

  if (!downloadUrl) {
    throw new Error('Cobalt returned no download URL');
  }

  return {
    id: url.match(/\/video\/(\d+)/)?.[1] || url.match(/\/p\/([^/]+)/)?.[1] || 'unknown',
    title: 'Downloaded via Cobalt', cover: '',
    duration: 0,
    author: { id: '', unique_id: 'unknown', nickname: 'Cobalt', avatar: '' },
    stats: { plays: 0, likes: 0, comments: 0, shares: 0, downloads: 0 },
    music: { id: '', title: 'Original Sound', author: '', url: '' },
    downloads: { nowm: downloadUrl, nowm_hd: downloadUrl, watermark: '', music: '' },
    images: [], isVideo: true,
  };
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
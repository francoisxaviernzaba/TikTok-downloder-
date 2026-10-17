import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Pre-tested sample trending TikTok videos for quick testing
const SAMPLE_VIDEOS = [
  {
    id: "sample-1",
    title: "Moo Deng Music Video 🎶 viral sensation",
    author: "Cliff 💎 (@therealmrcliff)",
    url: "https://www.tiktok.com/@therealmrcliff/video/7427804963037777159",
    category: "Viral / Animals"
  },
  {
    id: "sample-2",
    title: "Sometimes you need to eat an entire cucumber recipe",
    author: "Logan (@logagm)",
    url: "https://www.tiktok.com/@logagm/video/7404231127738748166",
    category: "Food / Recipe"
  }
];

// Helper: Normalize or resolve TikTok URL
async function resolveTikTokUrl(inputUrl: string): Promise<string> {
  const trimmed = inputUrl.trim();
  
  // If it's already standard tiktok.com/@user/video/id
  if (trimmed.includes('tiktok.com/@') && trimmed.includes('/video/')) {
    return trimmed;
  }

  // If it's a shortened vt.tiktok.com or vm.tiktok.com link, resolve redirect
  if (trimmed.includes('vt.tiktok.com') || trimmed.includes('vm.tiktok.com')) {
    try {
      const response = await fetch(trimmed, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
        }
      });
      if (response.url && response.url.includes('/video/')) {
        return response.url;
      }
    } catch {
      // Fallback to original
    }
  }

  return trimmed;
}

// Extraction service using TikWM
async function extractTikTokData(url: string) {
  const encodedParams = new URLSearchParams();
  encodedParams.set('url', url);
  encodedParams.set('hd', '1');

  const response = await fetch('https://tikwm.com/api/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Cookie': 'current_language=en',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Mobile Safari/537.36'
    },
    body: encodedParams.toString()
  });

  if (!response.ok) {
    throw new Error(`Upstream scraper returned HTTP ${response.status}`);
  }

  const json = await response.json();
  if (json.code !== 0 || !json.data) {
    throw new Error(json.msg || 'Failed to extract video details. Please verify the URL.');
  }

  const data = json.data;

  // Format images if photo carousel
  const images = Array.isArray(data.images) ? data.images : [];

  return {
    id: data.id || '',
    title: data.title || 'Untitled TikTok Video',
    cover: data.cover || data.origin_cover || '',
    duration: data.duration || 0,
    author: {
      id: data.author?.id || '',
      unique_id: data.author?.unique_id || 'unknown',
      nickname: data.author?.nickname || 'TikTok Creator',
      avatar: data.author?.avatar || ''
    },
    stats: {
      plays: data.play_count || 0,
      likes: data.digg_count || 0,
      comments: data.comment_count || 0,
      shares: data.share_count || 0,
      downloads: data.download_count || 0
    },
    music: {
      id: data.music_info?.id || '',
      title: data.music_info?.title || data.music || 'Original Sound',
      author: data.music_info?.author || '',
      url: data.music || ''
    },
    downloads: {
      // Direct high quality URLs without watermark
      nowm: data.play || '',
      nowm_hd: data.hdplay || data.play || '',
      watermark: data.wmplay || '',
      music: data.music || ''
    },
    images: images,
    isVideo: images.length === 0
  };
}

// API Routes
app.get('/api/samples', (_req: Request, res: Response) => {
  res.json({ success: true, samples: SAMPLE_VIDEOS });
});

app.post('/api/extract', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, error: 'A valid TikTok URL is required.' });
      return;
    }

    const cleanUrl = url.trim();
    if (!cleanUrl.includes('tiktok.com')) {
      res.status(400).json({
        success: false,
        error: 'Please enter a valid TikTok link (e.g., https://www.tiktok.com/@user/video/... or https://vm.tiktok.com/...)'
      });
      return;
    }

    const resolvedUrl = await resolveTikTokUrl(cleanUrl);
    const videoData = await extractTikTokData(resolvedUrl);

    res.json({
      success: true,
      data: videoData,
      originalUrl: cleanUrl,
      resolvedUrl: resolvedUrl
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error during extraction';
    res.status(422).json({
      success: false,
      error: msg.includes('Url parsing is failed')
        ? 'Could not parse this TikTok video. Ensure the video is public and the link is active.'
        : msg
    });
  }
});

// Proxy download route to stream media with required TikTok CDN referer
app.get('/api/download', async (req: Request, res: Response) => {
  try {
    const mediaUrl = req.query.url as string;
    const filename = (req.query.filename as string) || 'tiktok_video_nowatermark.mp4';
    const isAttachment = req.query.inline !== 'true';

    if (!mediaUrl) {
      res.status(400).send('Missing media URL parameter');
      return;
    }

    // Determine content type based on extension
    let contentType = 'video/mp4';
    if (filename.endsWith('.mp3')) contentType = 'audio/mpeg';
    if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) contentType = 'image/jpeg';
    if (filename.endsWith('.png')) contentType = 'image/png';

    // Fetch from TikTok CDN using appropriate referer and desktop UA
    const upstream = await fetch(mediaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/',
        'Accept': '*/*'
      }
    });

    if (!upstream.ok) {
      res.status(upstream.status).send(`Failed to stream media from source: ${upstream.statusText}`);
      return;
    }

    // Pass headers
    res.setHeader('Content-Type', upstream.headers.get('content-type') || contentType);
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    if (isAttachment) {
      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    }

    if (!upstream.body) {
      res.status(500).send('No response body from remote media server');
      return;
    }

    // Pipe the ReadableStream to Node response
    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          break;
        }
        res.write(Buffer.from(value));
      }
    };

    await pump();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Download streaming error';
    if (!res.headersSent) {
      res.status(500).send(`Download failed: ${msg}`);
    }
  }
});

// Vite integration
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

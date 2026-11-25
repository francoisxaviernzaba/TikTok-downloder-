/**
 * Backend proxy — multi-backend extraction + media streaming.
 *
 * Replaces the single TikWM backend with a multi-platform dispatcher that
 * routes by URL domain to the right public API (YouTube, Twitter, Reddit,
 * Vimeo, Dailymotion, Cobalt for TikTok/Instagram).
 *
 * The API key stays server-side. The frontend calls /api/extract (same origin).
 */

import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractVideo, backendForUrl } from './src/lib/backends.js';

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

// API Routes
app.get('/api/samples', (_req: Request, res: Response) => {
  res.json({ success: true, samples: SAMPLE_VIDEOS });
});

app.post('/api/extract', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, error: 'A valid URL is required.' });
      return;
    }

    const cleanUrl = url.trim();
    const backend = backendForUrl(cleanUrl);
    if (!backend) {
      res.status(400).json({
        success: false,
        error: 'Unsupported URL. Supports YouTube, Twitter/X, Reddit, Vimeo, Dailymotion, TikTok, Instagram.'
      });
      return;
    }

    const videoData = await extractVideo(cleanUrl, process.env);

    res.json({
      success: true,
      data: videoData,
      originalUrl: cleanUrl,
      resolvedUrl: cleanUrl,
      backend
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error during extraction';
    res.status(422).json({ success: false, error: msg });
  }
});

// Stream media with required TikTok CDN referer.
async function streamMedia(
  upstream: globalThis.Response,
  res: Response,
  filename: string,
  isAttachment: boolean
): Promise<void> {
  let contentType = 'video/mp4';
  if (filename.endsWith('.mp3')) contentType = 'audio/mpeg';
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) contentType = 'image/jpeg';
  if (filename.endsWith('.png')) contentType = 'image/png';

  if (upstream.status === 206) res.status(206);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || contentType);
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) res.setHeader('Content-Length', contentLength);
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) res.setHeader('Content-Range', contentRange);

  if (isAttachment) {
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  }

  if (!upstream.body) {
    res.status(500).send('No response body from remote media server');
    return;
  }

  const reader = upstream.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      res.end();
      break;
    }
    res.write(Buffer.from(value));
  }
}

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

    const upstream = await fetch(mediaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/',
        'Accept': '*/*',
        ...(req.headers.range ? { Range: req.headers.range as string } : {})
      }
    });

    if (!upstream.ok) {
      res.status(upstream.status).send(`Failed to stream media from source: ${upstream.statusText}`);
      return;
    }

    await streamMedia(upstream, res, filename, isAttachment);
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
import express from 'express';
import type { Request, Response as ExpressResponse } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { resolveTikTok, pickMediaUrl, getContentType, getFileExtension, sanitizeFilename, validateSrcUrl, validateMediaUrl, invalidateCacheForUrl } from './backend/tiktok.ts';
import { getEnabledResolverNames } from './backend/resolvers/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Pre-tested sample trending TikTok videos for quick testing
const SAMPLE_VIDEOS = [
  {
    id: 'sample-1',
    title: 'Moo Deng Music Video 🎶 viral sensation',
    author: 'Cliff 💎 (@therealmrcliff)',
    url: 'https://www.tiktok.com/@therealmrcliff/video/7427804963037777159',
    category: 'Viral / Animals',
  },
  {
    id: 'sample-2',
    title: 'Sometimes you need to eat an entire cucumber recipe',
    author: 'Logan (@logagm)',
    url: 'https://www.tiktok.com/@logagm/video/7404231127738748166',
    category: 'Food / Recipe',
  },
];

// API Routes
app.get('/api/samples', (_req: Request, res: ExpressResponse) => {
  res.json({ success: true, samples: SAMPLE_VIDEOS });
});

app.post('/api/extract', async (req: Request, res: ExpressResponse) => {
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
        error: 'Please enter a valid TikTok link (e.g., https://www.tiktok.com/@user/video/... or https://vm.tiktok.com/...)',
      });
      return;
    }

    const videoData = await resolveTikTok(cleanUrl);

    // Strip internal session cookies from the client-facing payload (kept in cache for downloads).
    const { cookies: _cookies, ...publicData } = videoData;

    res.json({
      success: true,
      data: publicData,
      originalUrl: cleanUrl,
      resolvedUrl: videoData.sourceUrl,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error during extraction';
    res.status(422).json({
      success: false,
      error: msg.includes('Url parsing is failed')
        ? 'Could not parse this TikTok video. Ensure the video is public and the link is active.'
        : msg,
    });
  }
});

type MediaKind = 'video' | 'hd' | 'music' | 'cover' | 'image';

// Proxy download route: streams media with required TikTok CDN referer.
// Accepts: src (TikTok URL), kind (video|hd|music|cover|image), index (for images), inline (bool).
// Legacy fallback: if src absent, accepts raw CDN url via ?url= (backward compat).
app.get('/api/download', async (req: Request, res: ExpressResponse) => {
  const kind = ((req.query.kind as string) || 'video') as MediaKind;
  const index = parseInt(req.query.index as string, 10) || 0;
  const isAttachment = req.query.inline !== 'true';
  const filenameParam = req.query.filename as string | undefined;
  const src = req.query.src as string | undefined;
  const legacyUrl = req.query.url as string | undefined;

  try {
    let fetchUrl: string;
    let videoId = 'video';
    let resolvedData: Awaited<ReturnType<typeof resolveTikTok>> | null = null;

    if (src) {
      // New path: src + kind (+ index)
      validateSrcUrl(src);
      resolvedData = await resolveTikTok(src);
      const picked = pickMediaUrl(resolvedData, kind, index);
      if (!picked) {
        res.status(400).send(`No media URL available for kind="${kind}"`);
        return;
      }
      validateMediaUrl(picked);
      fetchUrl = picked;
      videoId = resolvedData.id || videoId;
    } else if (legacyUrl) {
      // Legacy path: raw CDN URL (backward compat)
      validateMediaUrl(legacyUrl);
      fetchUrl = legacyUrl;
    } else {
      res.status(400).send('Missing required parameter: src (TikTok URL) or url (legacy CDN URL)');
      return;
    }

    const doFetch = (url: string, cookies?: string) =>
      fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://www.tiktok.com/',
          Accept: '*/*',
          // Some TikTok CDN URLs require the session cookie captured during page scrape
          ...(cookies ? { Cookie: cookies } : {}),
          // Forward Range header for seeking support
          ...(req.headers.range ? { Range: req.headers.range } : {}),
        },
      });

    let upstream = await doFetch(fetchUrl, resolvedData?.cookies);
    let usedReResolve = false;

    // Re-resolve on 401/403/410 (expired signed URL), at most once.
    if ((upstream.status === 401 || upstream.status === 403 || upstream.status === 410) && resolvedData && src) {
      console.log(`[download] Upstream ${upstream.status}; invalidating cache and re-resolving once`);
      invalidateCacheForUrl(src);
      usedReResolve = true;
      try {
        resolvedData = await resolveTikTok(src);
        const picked = pickMediaUrl(resolvedData, kind, index);
        if (picked) {
          validateMediaUrl(picked);
          fetchUrl = picked;
          upstream = await doFetch(fetchUrl, resolvedData?.cookies);
        }
      } catch (reResolveErr) {
        console.error('[download] Re-resolve failed:', reResolveErr);
      }
    }

    if (!upstream.ok) {
      const statusText = upstream.statusText || 'Unknown error';
      if (usedReResolve) {
        res.status(502).send(`Failed to stream media after re-resolve: ${upstream.status} ${statusText}`);
      } else {
        res.status(upstream.status).send(`Failed to stream media from source: ${upstream.status} ${statusText}`);
      }
      return;
    }

    // Determine filename + content type from kind
    const defaultFilename = `tiktok_${videoId}_${kind}.${getFileExtension(kind)}`;
    let filename = sanitizeFilename(filenameParam || defaultFilename);

    // Music may be mp3 or m4a depending on the source; align the extension with the real content type.
    if (kind === 'music') {
      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('mpeg') || ct.includes('mp3')) filename = filename.replace(/\.[^.]+$/, '.mp3');
      else if (ct.includes('mp4') || ct.includes('m4a') || ct.includes('aac')) filename = filename.replace(/\.[^.]+$/, '.m4a');
      else if (ct.includes('ogg')) filename = filename.replace(/\.[^.]+$/, '.ogg');
    }

    // Some providers return application/octet-stream; force the correct type so inline <video> plays.
    const upstreamCt = upstream.headers.get('content-type') || '';
    const fallbackCt = getContentType(kind);
    let contentType = fallbackCt;
    if (kind === 'video' || kind === 'hd') {
      if (upstreamCt.startsWith('video/')) contentType = upstreamCt;
    } else if (kind === 'music') {
      if (upstreamCt.startsWith('audio/')) contentType = upstreamCt;
    } else if (kind === 'cover' || kind === 'image') {
      if (upstreamCt.startsWith('image/')) contentType = upstreamCt;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Forward Range-related headers from upstream
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) {
      res.setHeader('Content-Range', contentRange);
      res.status(206); // Partial content
    }

    res.setHeader('Content-Disposition', `${isAttachment ? 'attachment' : 'inline'}; filename="${filename}"`);

    if (!upstream.body) {
      res.status(500).send('No response body from remote media server');
      return;
    }

    // Pipe the ReadableStream to the Node response
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } catch (err) {
      console.error('[download] Stream pump error:', err);
      if (!res.headersSent) {
        res.status(500).send('Download streaming error');
      } else {
        res.destroy();
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Download streaming error';
    console.error('[download] Error:', msg);
    if (!res.headersSent) {
      res.status(400).send(msg);
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
      appType: 'spa',
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
    console.log(`Enabled resolvers: ${getEnabledResolverNames().join(', ')}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
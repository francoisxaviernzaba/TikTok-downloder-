// TikDownloader Helper — background service worker.
// Runs on the USER'S machine (residential IP). Fetches the TikTok page,
// extracts the no-watermark link, then downloads the video from the user's IP.
// The server is never involved in the video transfer.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function decodeEscapes(s) {
  return s
    .replace(/\\u002F/gi, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/')
    .replace(/\\u003D/gi, '=')
    .replace(/\\u003F/gi, '?');
}

function extractId(url) {
  return (
    (url.match(/\/video\/(\d+)/) || [])[1] ||
    (url.match(/\/photo\/(\d+)/) || [])[1] ||
    'tiktok'
  );
}

async function extractTikTok(url) {
  const page = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
  });
  if (!page.ok) throw new Error('TikTok page returned HTTP ' + page.status);
  const html = await page.text();

  const playAddr = (html.match(/"playAddr":"([^"]+)"/) || [])[1];
  const downloadAddr = (html.match(/"downloadAddr":"([^"]+)"/) || [])[1];
  const desc = (html.match(/"desc":"([^"]+)"/) || [])[1] || 'TikTok Video';
  const uniqueId = (html.match(/"uniqueId":"([^"]+)"/) || [])[1] || '';

  if (!playAddr) {
    throw new Error(
      'No no-watermark URL found. The video may be private, region-locked, or a photo slideshow.'
    );
  }

  return {
    nowm: decodeEscapes(playAddr),
    watermark: downloadAddr ? decodeEscapes(downloadAddr) : '',
    title: desc,
    author: uniqueId,
    id: extractId(url),
  };
}

async function downloadBlob(url, filename) {
  // Fetch the video from the user's IP. The declarativeNetRequest rule sets the
  // Referer to https://www.tiktok.com/ so TikTok's CDN (Akamai) accepts it.
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('Video download failed: HTTP ' + r.status);
  const blob = await r.blob();
  const objUrl = URL.createObjectURL(blob);
  await chrome.downloads.download({ url: objUrl, filename, saveAs: true });
  // Revoke later; the download has already started.
  setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'EXTRACT') return false;
  const url = msg.url;

  (async () => {
    try {
      const data = await extractTikTok(url);
      const filename = `tiktok_${data.id}_nowm.mp4`;
      await downloadBlob(data.nowm, filename);
      sendResponse({ ok: true, title: data.title, author: data.author, filename });
    } catch (e) {
      sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  })();

  return true; // keep the message channel open for the async response
});
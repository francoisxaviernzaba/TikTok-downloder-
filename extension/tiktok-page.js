// TikDownloader Helper — TikTok page content script.
// Runs on https://*.tiktok.com/* tabs. Reads the no-watermark link from the
// loaded DOM, then downloads the video FROM THE TAB (page origin + cookies).
// The CDN sends Access-Control-Allow-Origin for www.tiktok.com with credentials,
// so this fetch is allowed; the blob is saved via an <a download> (same-origin).

function decodeEscapes(s) {
  return s
    .replace(/\\u002F/gi, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/')
    .replace(/\\u003D/gi, '=')
    .replace(/\\u003F/gi, '?');
}

function readFromDom() {
  const html = document.documentElement.outerHTML;
  return {
    playAddr: (html.match(/"playAddr":"([^"]+)"/) || [])[1] || null,
    desc: (html.match(/"desc":"([^"]+)"/) || [])[1] || '',
  };
}

function extractId() {
  return (
    (location.href.match(/\/video\/(\d+)/) || [])[1] ||
    (location.href.match(/\/photo\/(\d+)/) || [])[1] ||
    'tiktok'
  );
}

async function run() {
  // Poll for the link (the JSON may not be in the DOM at document_idle).
  let data = null;
  for (let i = 0; i < 14; i++) {
    data = readFromDom();
    if (data.playAddr) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!data || !data.playAddr) {
    return { ok: false, error: 'Could not read the video link. The video may be private, region-locked, or a photo slideshow.' };
  }

  const playAddr = decodeEscapes(data.playAddr);
  const filename = `tiktok_${extractId()}_nowm.mp4`;

  const r = await fetch(playAddr, { credentials: 'include' });
  if (!r.ok) return { ok: false, error: 'Video download blocked: HTTP ' + r.status };

  const blob = await r.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);

  return { ok: true, filename, title: data.desc };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'READ_PLAYADDR') return false;
  run().then(sendResponse).catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
  return true;
});
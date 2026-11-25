// TikDownloader Helper — background service worker.
// Runs on the USER'S machine (residential IP).
//
// The TikTok page is loaded in a real background TAB (a normal navigation that
// Akamai accepts — a service-worker fetch of the page gets 403). A content
// script reads the no-watermark link from the loaded DOM. The video is then
// fetched here with credentials:'include' (sends the user's tiktok cookies) and
// the tiktok referer (set by rules.json), and saved as a blob. The server is
// never involved.

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

function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(finish, timeoutMs);
  });
}

function readPlayAddr(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: 'READ_PLAYADDR' }, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(resp);
    });
  });
}

async function extractViaTab(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTabComplete(tab.id);
    // The content script retries internally, but ask once more after a beat.
    let resp = await readPlayAddr(tab.id);
    if (!resp || !resp.ok) {
      await new Promise((r) => setTimeout(r, 1500));
      resp = await readPlayAddr(tab.id);
    }
    if (!resp || !resp.ok || !resp.playAddr) {
      throw new Error(
        'Could not read the video link. The video may be private, region-locked, or a photo slideshow.'
      );
    }
    return {
      nowm: decodeEscapes(resp.playAddr),
      watermark: resp.downloadAddr ? decodeEscapes(resp.downloadAddr) : '',
      title: resp.desc || 'TikTok Video',
      id: extractId(url),
    };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function downloadVideo(url, filename) {
  // Fetch with cookies (credentials:'include') + tiktok referer (rules.json).
  const r = await fetch(url, {
    headers: { 'User-Agent': UA },
    credentials: 'include',
  });
  if (!r.ok) throw new Error('Video download blocked: HTTP ' + r.status);
  const blob = await r.blob();
  const objUrl = URL.createObjectURL(blob);
  await chrome.downloads.download({ url: objUrl, filename, saveAs: true });
  setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'EXTRACT') return false;
  const url = msg.url;

  (async () => {
    try {
      const data = await extractViaTab(url);
      const filename = `tiktok_${data.id}_nowm.mp4`;
      await downloadVideo(data.nowm, filename);
      sendResponse({ ok: true, title: data.title, filename });
    } catch (e) {
      sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  })();

  return true;
});
// TikDownloader Helper — background service worker.
// Runs on the USER'S machine (residential IP).
//
// The TikTok page is loaded in a real background TAB (a normal browser
// navigation that Akamai accepts — a service-worker fetch gets 403). A content
// script reads the no-watermark link from the loaded DOM, then the browser's
// download manager saves the video (it sends cookies + the tiktok referer set by
// rules.json). The server is never involved.

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
  // Open the video in a background tab so the page loads like a real visit.
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTabComplete(tab.id);
    const resp = await readPlayAddr(tab.id);
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'EXTRACT') return false;
  const url = msg.url;

  (async () => {
    try {
      const data = await extractViaTab(url);
      const filename = `tiktok_${data.id}_nowm.mp4`;
      // The download manager fetches from the user's IP with cookies + referer.
      await chrome.downloads.download({ url: data.nowm, filename, saveAs: true });
      sendResponse({ ok: true, title: data.title, filename });
    } catch (e) {
      sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  })();

  return true; // keep the channel open for the async response
});
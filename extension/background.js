// TikDownloader Helper — background service worker.
// Opens the video in a background tab, then injects a single script that reads
// the no-watermark link from the DOM and downloads the video FROM THE TAB
// (page origin + cookies; the CDN allows CORS for www.tiktok.com with
// credentials). One executeScript call avoids cross-context messaging races.

function waitForTabComplete(tabId, timeoutMs = 18000) {
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

// Injected into the TikTok tab. Reads the link, downloads the video, returns a
// plain result object. Must be self-contained (no closure variables).
async function grabAndDownload() {
  const decode = (s) =>
    s.replace(/\\u002F/gi, '/').replace(/\\u0026/gi, '&').replace(/\\\//g, '/');

  let html = document.documentElement.outerHTML;
  let playAddr = (html.match(/"playAddr":"([^"]+)"/) || [])[1] || null;
  for (let i = 0; i < 14 && !playAddr; i++) {
    await new Promise((r) => setTimeout(r, 500));
    html = document.documentElement.outerHTML;
    playAddr = (html.match(/"playAddr":"([^"]+)"/) || [])[1] || null;
  }
  if (!playAddr) {
    return { ok: false, error: 'Could not read the video link. The video may be private, region-locked, or a photo slideshow.' };
  }

  const url = decode(playAddr);
  const id = (location.href.match(/\/video\/(\d+)/) || [])[1] || 'tiktok';
  const filename = `tiktok_${id}_nowm.mp4`;

  const r = await fetch(url, { credentials: 'include' });
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

  return { ok: true, filename };
}

let keepAlive = null;
function startKeepAlive() {
  stopKeepAlive();
  keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20_000);
}
function stopKeepAlive() {
  if (keepAlive) {
    clearInterval(keepAlive);
    keepAlive = null;
  }
}

async function runInTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: grabAndDownload,
    world: 'MAIN',
  });
  return results && results[0] ? results[0].result : { ok: false, error: 'No result from page' };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'EXTRACT') return false;
  const url = msg.url;

  (async () => {
    let tab = null;
    startKeepAlive();
    try {
      tab = await chrome.tabs.create({ url, active: false });
      await waitForTabComplete(tab.id);

      let resp = await runInTab(tab.id);
      // Retry once if the tab was still redirecting / not ready.
      if (!resp || !resp.ok) {
        await new Promise((r) => setTimeout(r, 2000));
        resp = await runInTab(tab.id);
      }
      sendResponse(resp || { ok: false, error: 'No response from the TikTok page.' });
    } catch (e) {
      sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
    } finally {
      stopKeepAlive();
      if (tab) chrome.tabs.remove(tab.id).catch(() => {});
    }
  })();

  return true;
});
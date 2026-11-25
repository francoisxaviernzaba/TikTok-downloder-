// TikDownloader Helper — background service worker (thin relay).
// Opens the video in a background tab and asks the tab's content script to read
// the link + download the file (the tab has the page origin + cookies, so the
// CDN accepts it). Keeps the worker alive while the tab works.

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

function waitForTabComplete(tabId, timeoutMs = 15000) {
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'EXTRACT') return false;
  const url = msg.url;

  (async () => {
    let tab = null;
    startKeepAlive();
    try {
      tab = await chrome.tabs.create({ url, active: false });
      await waitForTabComplete(tab.id);

      const resp = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, { type: 'READ_PLAYADDR' }, (r) => {
          const err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message));
          else resolve(r);
        });
      });

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
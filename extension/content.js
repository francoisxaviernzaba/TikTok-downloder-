// TikDownloader Helper — content script.
// Content scripts run in an ISOLATED world, so setting window.* here does NOT
// reach the page. We communicate with the page via window.postMessage instead.
// The background worker (user's own IP) does the actual fetch + download.

function announce() {
  window.postMessage({ type: 'TIKDOWNLOADER_EXT_HELLO' }, '*');
}

// Announce on load, and re-announce if the page pings (covers load-order races).
announce();

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const d = event.data;
  if (!d || typeof d.type !== 'string') return;

  if (d.type === 'TIKDOWNLOADER_PING') {
    announce();
    return;
  }

  if (d.type === 'TIKDOWNLOADER_EXTRACT') {
    chrome.runtime.sendMessage({ type: 'EXTRACT', url: d.url }, (resp) => {
      const lastErr = chrome.runtime.lastError;
      window.postMessage(
        {
          type: 'TIKDOWNLOADER_RESULT',
          requestId: d.requestId,
          ok: !!(resp && resp.ok),
          error: lastErr ? lastErr.message : resp && resp.error,
          title: resp && resp.title,
          filename: resp && resp.filename,
        },
        '*'
      );
    });
  }
});
// TikDownloader Helper — content script.
// Injected into the TikDownloader website. Detects the extension's presence and
// relays download requests from the page to the background worker (which runs on
// the user's own IP). The page never talks to TikTok's CDN directly.

window.__TIKDOWNLOADER_EXT__ = true;

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const d = event.data;
  if (!d || d.type !== 'TIKDOWNLOADER_EXTRACT') return;

  chrome.runtime.sendMessage({ type: 'EXTRACT', url: d.url }, (resp) => {
    // The background may have thrown; surface a clean error to the page.
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
});
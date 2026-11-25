// TikDownloader Helper — TikTok page content script.
// Runs on https://*.tiktok.com/* tabs. Reads the no-watermark video link from
// the already-loaded page DOM (the embedded JSON). Polls briefly because the
// JSON may not be in the DOM at document_idle on a slow load.

function readFromDom() {
  const html = document.documentElement.outerHTML;
  return {
    playAddr: (html.match(/"playAddr":"([^"]+)"/) || [])[1] || null,
    downloadAddr: (html.match(/"downloadAddr":"([^"]+)"/) || [])[1] || null,
    desc: (html.match(/"desc":"([^"]+)"/) || [])[1] || '',
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'READ_PLAYADDR') return false;

  let attempts = 0;
  const maxAttempts = 12; // ~12 * 500ms = 6s
  const tick = () => {
    const r = readFromDom();
    if (r.playAddr || attempts >= maxAttempts) {
      sendResponse({ ok: !!r.playAddr, playAddr: r.playAddr, downloadAddr: r.downloadAddr, desc: r.desc });
      return;
    }
    attempts += 1;
    setTimeout(tick, 500);
  };
  tick();
  return true; // async sendResponse
});
// TikDownloader Helper — TikTok page content script.
// Runs on https://*.tiktok.com/* tabs. Reads the no-watermark video link from
// the already-loaded page DOM (the embedded JSON), so no extra fetch is needed
// (a service-worker fetch gets 403 from Akamai; a real page load does not).

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'READ_PLAYADDR') return false;

  const html = document.documentElement.outerHTML;
  const playAddr = (html.match(/"playAddr":"([^"]+)"/) || [])[1] || null;
  const downloadAddr = (html.match(/"downloadAddr":"([^"]+)"/) || [])[1] || null;
  const desc = (html.match(/"desc":"([^"]+)"/) || [])[1] || '';

  sendResponse({ ok: !!playAddr, playAddr, downloadAddr, desc });
  return true;
});
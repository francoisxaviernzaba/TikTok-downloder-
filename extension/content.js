// TikDownloader Helper — website content script.
// Content scripts run in an isolated world, so we announce via postMessage
// (which crosses to the page). The page uses this to hide the install banner.
// Downloads happen on TikTok pages (tiktok-page.js), not here.

function announce() {
  window.postMessage({ type: 'TIKDOWNLOADER_EXT_HELLO' }, '*');
}
announce();

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const d = event.data;
  if (d && d.type === 'TIKDOWNLOADER_PING') announce();
});
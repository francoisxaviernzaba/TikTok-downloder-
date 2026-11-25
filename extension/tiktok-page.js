// TikDownloader Helper — TikTok page content script.
// Adds a floating "Download (no watermark)" button on TikTok video pages and
// downloads the video from the page's own context (origin + cookies; the CDN
// allows CORS for www.tiktok.com with credentials). Also auto-downloads when the
// page is opened with ?tdl=1 (used by the website's download button).

(function () {
  if (window.__TIKDOWNLOADER_PAGE__) return;
  window.__TIKDOWNLOADER_PAGE__ = true;

  const decode = (s) =>
    s.replace(/\\u002F/gi, '/').replace(/\\u0026/gi, '&').replace(/\\\//g, '/');

  function readPlayAddr() {
    const html = document.documentElement.outerHTML;
    return (html.match(/"playAddr":"([^"]+)"/) || [])[1] || null;
  }

  function extractId() {
    return (
      (location.href.match(/\/video\/(\d+)/) || [])[1] ||
      (location.href.match(/\/photo\/(\d+)/) || [])[1] ||
      'tiktok'
    );
  }

  async function waitForPlayAddr(tries) {
    for (let i = 0; i < tries; i++) {
      const p = readPlayAddr();
      if (p) return p;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  }

  async function download() {
    const playAddr = await waitForPlayAddr(16);
    if (!playAddr) {
      alert('Could not find the video link. Open a TikTok VIDEO page and try again.');
      return;
    }
    const url = decode(playAddr);
    const filename = `tiktok_${extractId()}_nowm.mp4`;
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) {
      alert('Download blocked by TikTok (HTTP ' + r.status + ').');
      return;
    }
    const blob = await r.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
  }

  let busy = false;
  async function safeDownload() {
    if (busy) return;
    busy = true;
    try {
      await download();
    } catch (e) {
      alert('Download error: ' + (e && e.message ? e.message : e));
    } finally {
      busy = false;
    }
  }

  function addButton() {
    if (document.getElementById('tikdownloader-btn')) return;
    if (!document.body) return;
    const btn = document.createElement('button');
    btn.id = 'tikdownloader-btn';
    btn.textContent = '⬇ Download (no watermark)';
    btn.style.cssText =
      'position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#e11d48;color:#fff;border:none;padding:12px 18px;border-radius:10px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.4);font-family:Arial,sans-serif;font-size:14px;';
    btn.addEventListener('click', safeDownload);
    document.body.appendChild(btn);
  }

  // TikTok is a SPA — re-add the button on navigation.
  setInterval(addButton, 1500);
  addButton();

  // Auto-download when opened from the website (?tdl=1).
  if (location.search.indexOf('tdl=1') !== -1) {
    setTimeout(safeDownload, 1500);
  }

  // Triggered by the extension popup's "Download current page" button.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'FORCE_DOWNLOAD') {
      safeDownload().then(() => sendResponse({ ok: true }));
      return true;
    }
    return false;
  });
})();
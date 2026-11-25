// TikDownloader Helper — popup logic.
const goBtn = document.getElementById('go');
const statusEl = document.getElementById('status');

function setStatus(text) {
  statusEl.textContent = text || '';
}

goBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.url || !/tiktok\.com/.test(tab.url)) {
      setStatus('Open a TikTok video page first.');
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: 'FORCE_DOWNLOAD' }, (resp) => {
      if (chrome.runtime.lastError) {
        setStatus('Could not reach the page. Refresh the TikTok tab and try again.');
        return;
      }
      setStatus(resp && resp.ok ? 'Download started.' : 'Could not read the video on this page.');
    });
  });
});
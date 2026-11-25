// TikDownloader Helper — popup logic.
const input = document.getElementById('url');
const goBtn = document.getElementById('go');
const pasteBtn = document.getElementById('paste');
const statusEl = document.getElementById('status');

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls || 'muted';
}

function isTikTokUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'tiktok.com' || host.endsWith('.tiktok.com');
  } catch {
    return false;
  }
}

// Pre-fill from the active tab if it's a TikTok video page.
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs && tabs[0];
  if (tab && tab.url && isTikTokUrl(tab.url) && /\/video\/|\/photo\//.test(tab.url)) {
    input.value = tab.url;
  }
});

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      input.value = text.trim();
      setStatus('Pasted.', 'muted');
    } else {
      setStatus('Clipboard is empty.', 'err');
    }
  } catch {
    setStatus('Could not read clipboard — paste manually.', 'err');
  }
});

async function start() {
  const url = input.value.trim();
  if (!url) {
    setStatus('Enter a TikTok URL first.', 'err');
    return;
  }
  if (!isTikTokUrl(url)) {
    setStatus('That does not look like a TikTok URL.', 'err');
    return;
  }

  goBtn.disabled = true;
  setStatus('Extracting…', 'muted');

  chrome.runtime.sendMessage({ type: 'EXTRACT', url }, (resp) => {
    goBtn.disabled = false;
    if (chrome.runtime.lastError) {
      setStatus('Error: ' + chrome.runtime.lastError.message, 'err');
      return;
    }
    if (resp && resp.ok) {
      setStatus('Downloaded: ' + (resp.filename || 'video'), 'ok');
    } else {
      setStatus('Failed: ' + ((resp && resp.error) || 'unknown error'), 'err');
    }
  });
}

goBtn.addEventListener('click', start);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') start();
});
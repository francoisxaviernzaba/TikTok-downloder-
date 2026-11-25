/**
 * Bridge to the TikDownloader browser extension.
 *
 * The extension runs on the user's own machine (residential IP). For TikTok,
 * the server cannot fetch the video (datacenter IPs are blocked by TikTok's CDN),
 * so we delegate the download to the extension, which fetches from the user's IP.
 *
 * Content scripts run in an isolated JS world, so we detect the extension via
 * window.postMessage (which crosses the isolated/main world boundary), not by
 * reading a window property.
 */

export interface ExtensionResult {
  ok: boolean;
  error?: string;
  filename?: string;
}

let installed = false;
const readyCallbacks: Array<() => void> = [];

function markInstalled(): void {
  if (installed) return;
  installed = true;
  window.dispatchEvent(new Event('tikdownloader-ext-ready'));
  readyCallbacks.splice(0).forEach((cb) => cb());
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (d && d.type === 'TIKDOWNLOADER_EXT_HELLO') markInstalled();
  });
  // Ping the content script in case its initial hello fired before we were listening.
  window.postMessage({ type: 'TIKDOWNLOADER_PING' }, '*');
}

/** True if the extension's content script has announced itself on this page. */
export function hasExtension(): boolean {
  return installed;
}

/** Run cb once the extension is detected (immediately if already detected). */
export function onExtensionReady(cb: () => void): void {
  if (installed) {
    cb();
    return;
  }
  readyCallbacks.push(cb);
}

/** True if a media URL points at a TikTok CDN host. */
export function isTiktokMediaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'tiktok.com' || host.endsWith('.tiktok.com');
  } catch {
    return false;
  }
}

/**
 * Ask the extension to extract + download a TikTok video on the user's IP.
 * Resolves when the extension reports back (success or error).
 */
export function downloadViaExtension(url: string): Promise<ExtensionResult> {
  return new Promise((resolve) => {
    if (!hasExtension()) {
      resolve({ ok: false, error: 'TikDownloader extension is not installed.' });
      return;
    }

    const requestId = Math.random().toString(36).slice(2);
    const handler = (event: MessageEvent) => {
      if (event.source !== window) return;
      const d = event.data;
      if (d && d.type === 'TIKDOWNLOADER_RESULT' && d.requestId === requestId) {
        window.removeEventListener('message', handler);
        resolve({ ok: !!d.ok, error: d.error, filename: d.filename });
      }
    };

    window.addEventListener('message', handler);
    window.postMessage({ type: 'TIKDOWNLOADER_EXTRACT', url, requestId }, '*');
  });
}
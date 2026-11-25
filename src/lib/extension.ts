/**
 * Bridge to the TikDownloader browser extension.
 *
 * The extension runs on the user's own machine (residential IP). For TikTok,
 * the server cannot fetch the video (datacenter IPs are blocked by TikTok's CDN),
 * so we delegate the download to the extension, which fetches from the user's IP.
 */

export interface ExtensionResult {
  ok: boolean;
  error?: string;
  filename?: string;
}

/** True if the extension's content script is present on this page. */
export function hasExtension(): boolean {
  return typeof window !== 'undefined' && (window as unknown as { __TIKDOWNLOADER_EXT__?: boolean }).__TIKDOWNLOADER_EXT__ === true;
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
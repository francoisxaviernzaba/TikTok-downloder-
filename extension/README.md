# TikDownloader Helper (browser extension)

Downloads TikTok videos **without watermark**, using **your own IP**.

The extension runs entirely on your machine:
1. It fetches the TikTok page (metadata only).
2. It reads the no-watermark video link.
3. It downloads the video **from your own connection**.

No server proxy is involved, so datacenter IP blocking (Akamai 403) does not apply —
your residential IP is trusted by TikTok's CDN.

## Install (Chrome / Edge / Brave — 1 minute)

1. Unzip `tikdownloader-extension.zip` somewhere permanent (e.g. `Documents/`).
   You will get a folder named **`TikDownloader-extension`** containing `manifest.json` and the other files.
2. Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the **`TikDownloader-extension`** folder
   (the one that contains `manifest.json` — not the parent folder).
5. The extension icon appears in your toolbar — pin it if you like.

## Use

1. Open a TikTok video in your browser (or copy its link).
2. Click the **TikDownloader** extension icon.
3. The URL auto-fills if you're on a TikTok video page; otherwise paste it.
4. Click **Download** → choose where to save → done.

## Notes

- Works only for **public** TikTok videos (private / region-locked won't extract).
- The extension briefly opens the video in a **background tab** to read the link
  (a direct server-style fetch is blocked by TikTok), then closes it and downloads.
- The first download may take a few seconds while the page loads.
- To update later, replace the folder contents and click the refresh icon on
  `chrome://extensions`.

## For Firefox

Firefox uses the same files but needs `background.scripts` instead of
`background.service_worker` in `manifest.json`. Use Chrome/Edge for now.
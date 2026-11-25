# TikDownloader Helper (browser extension)

Downloads TikTok videos **without watermark**, using **your own IP**.

The extension adds a red **"⬇ Download (no watermark)"** button on every TikTok
video page. It reads the no-watermark link from the page you're already viewing
and downloads the video from your own connection — no server proxy, no
datacenter blocking.

## Install (Chrome / Edge / Brave — 1 minute)

1. Unzip `tikdownloader-extension.zip` somewhere permanent (e.g. `Documents/`).
   You will get a folder named **`TikDownloader-extension`** containing `manifest.json` and the other files.
2. Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the **`TikDownloader-extension`** folder
   (the one that contains `manifest.json` — not the parent folder).
5. The extension icon appears in your toolbar — pin it if you like.

## Use

1. Open any **public TikTok video** in your browser.
2. Click the red **⬇ Download (no watermark)** button (bottom-right of the page).
   - Or click the extension icon → **Download current TikTok page**.
3. Pick a save location → done.

The website's Download button also works: it opens the video page and the
extension auto-downloads it.

## Notes

- Works only for **public** TikTok videos (private / region-locked won't extract).
- The video is fetched from your own connection, so it is never blocked.
- On the website, ignore the `v16-webapp-prime... 403` console line — that is the
  inline preview, not the download.
# TikTok Downloader — Resilience Hardening Plan

## Goal
Harden the existing TikTok downloader so a single upstream failure (TikWM rate-limit/outage, expired signed CDN URL) does not break downloads. Keep the current UI and the server-proxied streaming model.

## Context (current state)
- `server.ts` — Express server. `POST /api/extract` resolves via **TikWM only** (`extractTikTokData`, lines ~64-127). `GET /api/download` streams the mp4 **through the server** with a TikTok referer (lines ~172-240). `/api/download` currently takes a **raw CDN url** (`?url=`) and is an SSRF hole.
- `src/` — React/Vite client. `VideoResult`, `HistoryList`, `BatchDownloader` build download URLs as `/api/download?url=<raw CDN url>`. `App.tsx` saves history from `json.data` only.
- Types in `src/types.ts`. No caching, no fallback, no re-resolve, no Range support.

## Decisions (confirmed)
1. Scope: **harden existing app** (no rebuild, no JSON-only switch, no yt-dlp).
2. Resolver chain: **TikWM → Tikly → LoveTik → direct TikTok scraper**. Each normalized to `TikTokVideoData`. Per-resolver timeout. First success wins. (3 public API resolvers + scraper; the list is registry-driven and extensible via env.)
3. Cache: **in-memory TTL cache**, default 25 min (just under CDN expiry), swappable behind a small interface. Cache successes only; short negative cache for total failures.
4. Re-resolve: on upstream `401`/`403`/`410` before streaming, invalidate the cache entry and re-resolve **once**, then retry.
5. Keep server-side streaming (bandwidth tradeoff accepted). Add **Range** forwarding so `<video>` playback/seeking works.

## Verification evidence (why this matters)
Live checks during planning:
- `GET https://www.tikwm.com/api/?url=...&hd=1` → `{"code":-1,"msg":"Free Api Limit: 10000 request/ 1 day."}` (daily quota exhausted).
- `GET https://tiklydown.eu.org/api/download?url=...` → **521** (origin down / Cloudflare error).

=> The primary and a secondary are flaky *right now*. Consequences baked into the design:
- Every resolver must be **defensive** (try/catch, timeout, shape validation) and **env-configurable** (`RESOLVERS`, `RESOLVER_<NAME>_URL`).
- The **direct TikTok scraper is the most durable fallback** and must be robust.
- Cache + single-flight are essential to stay under free quotas.

## Architecture

```
Client
  POST /api/extract {url}   -> resolve (cache-first, single-flight) -> TikTokVideoData (+sourceUrl)
  GET  /api/download?src=<tiktok url>&kind=video|hd|music|cover|image&index=<n>&inline=<bool>
        -> resolve (cache-first) -> pick media url by kind -> fetch CDN (Range aware)
        -> on 401/403/410: invalidate + re-resolve once + retry -> stream (206 passthrough)
```

Cache key = canonical TikTok video id (fallback: normalized URL). Negative cache key = same, short TTL.

## Files

### New: `backend/` (server-only, outside `src/` so Vite never bundles it)
- `backend/cache.ts` — `get(key)`, `set(key, data)`, `invalidate(key)`, `negGet/negSet`; TTL + max-entries (Map + lazy prune). Env `CACHE_TTL_SECONDS` (default `1500`), `NEGATIVE_TTL_SECONDS` (default `60`), `CACHE_MAX_ENTRIES` (default `5000`).
- `backend/singleflight.ts` (or inside `tiktok.ts`) — in-flight promise map keyed by cache key so N simultaneous misses trigger **one** upstream chain, not N.
- `backend/resolvers/types.ts` — `Resolver { name: string; resolve(inputUrl: string): Promise<TikTokVideoData> }`; shared helpers: `fetchWithTimeout`, `normalizeAuthor/stats/music/downloads`, `canonicalVideoId`.
- `backend/resolvers/tikwm.ts` — port existing `extractTikTokData` (POST form `url`, `hd=1`).
- `backend/resolvers/tikly.ts` — `GET https://tiklydown.eu.org/api/download?url=<url>`; map `data.video.no_watermark` / `data.video.watermark` / `data.video.cover`, `data.images[]`, `data.music` into `TikTokVideoData`. Defensive optional-chaining + alternate field names.
- `backend/resolvers/lovetik.ts` — `POST https://lovetik.com/api/ajax/search` (`url=<url>`); normalize `data.*` (verify exact field names at implementation).
- `backend/resolvers/direct.ts` — direct scraper:
  1. Follow redirects to canonical `.../(video|photo)/<id>`.
  2. Fetch page HTML (desktop UA, then mobile UA fallback), extract `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">…</script>`.
  3. Read `__DEFAULT_SCOPE__["webapp.video-detail"].itemInfo.itemStruct` (guard missing → throw "private/removed").
  4. No-wm URL: `video.downloadAddr` if present, else `video.playAddr` with `playwm`→`play` (and strip `&...` only if it breaks the URL).
  5. Images: `imagePost.images[].imageURL.urlList[0]`. Music: `music.playUrl`. Stats/author from `itemStruct.stats` / `itemStruct.author`.
  6. Validate media host is an allowed TikTok CDN (see SSRF guard) before returning.
- `backend/resolvers/index.ts` — ordered registry `[tikwm, tikly, lovetik, direct]`, filtered by env `RESOLVERS` (comma list of names; default all). Each call wrapped with `RESOLVER_TIMEOUT_MS` (default `8000`) via `AbortController`. Optional per-resolver URL override via `RESOLVER_<NAME>_URL`.
- `backend/tiktok.ts` — `resolveTikTok(inputUrl)` (normalize → single-flight → cache/neg-cache get → chain → cache set / neg-cache set), `pickMediaUrl(data, kind, index)`, `canonicalVideoId(url)`, `isAllowedMediaHost(url)`.

### Modified: `server.ts`
- Replace `extractTikTokData` with `resolveTikTok` from `backend/tiktok.ts`. `/api/extract` response shape unchanged **plus** `data.sourceUrl = resolvedUrl` (extra field, non-breaking) so the client can re-resolve later.
- Rewrite `/api/download`:
  - Accept `src` (TikTok URL), `kind`, `index`, `inline`. Keep legacy raw `?url=` path as a **fallback only if `src` is absent** (backward compat).
  - **SSRF guard:** reject `src` whose host is not `tiktok.com`/`vt.tiktok.com`/`vm.tiktok.com` (case-insensitive). Reject media URLs whose host is not in the allowed TikTok CDN set (`tiktokcdn.com`, `tiktokv.com`, `byteoversea.com`, `muscdn.com`, `akamaized.net`, `ibytedtos.com` — verify exact hosts at implementation) or that resolve to private/loopback addresses.
  - Resolve cache-first; `pickMediaUrl` by kind; validate index bounds for `kind=image`.
  - Fetch CDN with desktop UA + `Referer: https://www.tiktok.com/`; forward client `Range` header; pass through upstream status `206` + `Content-Range` + `Accept-Ranges`.
  - On upstream `401`/`403`/`410`: `invalidate(src)`, re-resolve **once**, retry once; if still failing, `502` with a clear message.
  - Content type + filename by `kind`: `video|hd`→`video/mp4`/`.mp4`, `music`→`audio/mpeg`/`.mp3`, `cover|image`→`image/jpeg`/`.jpg`. Sanitize filename (keep existing regex).
  - Preserve streaming (ReadableStream pump). Log which resolver succeeded and each failure (name + status) for observability.

### Modified: `src/types.ts`
- Add optional `sourceUrl?: string` to `TikTokVideoData`.
- Add `sourceUrl: string` to `HistoryItem`.

### Modified: client components
- `src/App.tsx` — `saveToHistory` reads `data.sourceUrl`; store it on `HistoryItem`. (`handleExtract` already has `json.data`; server now provides `sourceUrl`.)
- `src/components/VideoResult.tsx` — `getDownloadUrl(kind, index)` → `/api/download?src=<data.sourceUrl>&kind=...`. Inline preview uses `kind=hd|video&inline=true`. Cover/music/slide actions use `kind=cover|music|image`.
- `src/components/HistoryList.tsx` — build `/api/download?src=<item.sourceUrl>&kind=video`; keep `downloadUrl` only as legacy fallback.
- `src/components/BatchDownloader.tsx` — build `/api/download?src=<item.url>&kind=video` (batch input already holds the source URL).
- Fallback when `sourceUrl` is missing (old history entries): reconstruct `https://www.tiktok.com/@${authorHandle}/video/${id}`.

### Modified: `.env.example`
- Document `CACHE_TTL_SECONDS`, `NEGATIVE_TTL_SECONDS`, `CACHE_MAX_ENTRIES`, `RESOLVER_TIMEOUT_MS`, `RESOLVERS`, optional `RESOLVER_<NAME>_URL`.

## Ordered tasks
1. Add `backend/cache.ts` (TTL + size cap + invalidate + negative cache).
2. Add `backend/resolvers/types.ts` (`Resolver`, `fetchWithTimeout`, normalize helpers, `canonicalVideoId`).
3. Port TikWM logic into `backend/resolvers/tikwm.ts`.
4. Add `backend/resolvers/tikly.ts` and `backend/resolvers/lovetik.ts`.
5. Add `backend/resolvers/direct.ts` (page + `__UNIVERSAL_DATA_FOR_REHYDRATION__` parse + host validation).
6. Add `backend/resolvers/index.ts` (ordered chain + timeout + env selection + URL overrides).
7. Add `backend/tiktok.ts` (canonical id, short-link expand, single-flight, resolve cache-first, pick media url, allowed-host guard).
8. Rewire `server.ts` `/api/extract` (attach `sourceUrl`) and `/api/download` (src/kind, SSRF guard, Range, 401/403/410 re-resolve, content-type by kind, legacy fallback).
9. Update `src/types.ts` + client components (`App`, `VideoResult`, `HistoryList`, `BatchDownloader`).
10. Update `.env.example`.
11. Validate (see below).

## Validation
- `npm run lint` (`tsc --noEmit`) passes.
- `npm run dev`, then:
  - Standard `.../video/<id>` resolves, plays inline, SD + HD download.
  - Photo slideshow (`.../photo/<id>`) resolves; per-slide image download works.
  - Short link `vm.tiktok.com/...` and `vt.tiktok.com/...` resolve.
  - MP3 download works.
  - **Fallback:** `RESOLVERS=tikly,lovetik,direct` (TikWM excluded) → still resolves. Then `RESOLVERS=direct` → direct scraper path works.
  - **Re-resolve:** `CACHE_TTL_SECONDS=1`; extract, wait for expiry, download twice → second download re-resolves and succeeds. Also simulate a stale link by editing a cached `downloads.nowm` to an invalid URL → download still succeeds via re-resolve.
  - **SSRF guard:** `/api/download?src=https://example.com/x` → rejected (400); `/api/download?src=http://127.0.0.1/` → rejected.
  - **Range:** inline video seeks; response is `206` with `Content-Range`.
  - **History:** re-download from Saved Library works after restart (uses stored `sourceUrl`); legacy item without `sourceUrl` reconstructs URL.
- Report any validation that could not be run (note: `shell` is denied in this planning session, so the implementing agent must run these).

## Risks / notes
- Public APIs are volatile (TikWM daily quota + Tikly 521 observed). Keep `RESOLVER_<NAME>_URL` overrides; expect to rotate providers.
- Direct scraper breaks when TikTok changes page markup — accept and maintain. TikTok may block datacenter IPs (Cloud Run); note as a limitation.
- In-memory cache is per-instance, resets on cold start, and is not shared across instances; fine at small scale, swap to Redis later without changing callers.
- Single-flight prevents cache stampede; negative cache prevents hammering all resolvers for bad URLs.
- Long streams that expire mid-transfer cannot be recovered; re-resolve only covers non-2xx at request start.
- Streaming through the server keeps the existing playback behavior (TikTok CDN referer) but costs bandwidth; JSON-only was explicitly rejected.
- Legal/ToS and pSEO/monetization are **out of scope**.

## Out of scope
- yt-dlp, Redis, Cloudflare Workers rewrite, pSEO, deployment/infra changes, auth/rate-limiting.

## Open assumption
- "At least 3 fallback public APIs" is implemented as **3 public API resolvers (TikWM, Tikly, LoveTik) + 1 direct scraper**. The registry + `RESOLVERS`/`RESOLVER_<NAME>_URL` env knobs make adding a 4th/5th provider a config-only change (no code edit).
# Handle qBittorrent 4 and 5 quirks and split Prowlarr offers by category

## Decision

qBittorrent (`packages/server/src/QBittorrent.ts`, `packages/server/src/QBittorrentDownloads.ts`):

- **Fresh sign-in per call**: `signIn()` logs into `/api/v2/auth/login` for each call instead of keeping a session between 1-minute watches.
- **Origin and version quirks**: Every request sets `Origin` and `Referer` to `url`. Login checks both status `< 300` and a non-empty cookie jar; `/api/v2/torrents/add` checks both status `200` and body `!== "Fails."`; `stallOf` recognises both `"stoppedDL"` (v5) and `"pausedDL"` (v4). Resuming a torrent calls `/api/v2/torrents/start` (v5 only, without a v4 fallback).
- **Category and tag**: Every grab is added under `DOWNLOADS_CATEGORY` (default `"books"`) and tagged with its `GrabId`, which `watchDownloads` and `remove` use to match torrents back to grabs.

Prowlarr (`packages/server/src/ProwlarrIndexer.ts`):

- Searches request categories `3030` (audiobooks) and `7020` (ebooks); `kindOf` maps `3000..3999` to `"audio"` and `7000..7999` to `"text"`.
- `releasesOf` keeps the 10 most-seeded releases of each kind (`OFFERS = 10`), then merges and sorts by seeders descending.

## Why

- Signing in afresh avoids stale cookie handling across the 1-minute watch interval and container restarts.
- qBittorrent 5 enforces CSRF `Origin`/`Referer` checks and changed login/duplicate status codes and stopped state names compared to v4.
- Tagging each torrent with its `GrabId` links torrents back to domain grabs without storing qBittorrent hashes in the model.
- Capping Prowlarr results at 10 per edition kind prevents a popular book with dozens of high-seeded ebook uploads from crowding out all audiobook offers (or vice versa).

## What breaks if you change this

- Removing `Origin`/`Referer` headers causes qBittorrent 5 to reject API requests with `403`.
- Checking only `response.status === 200` on `/api/v2/torrents/add` misses qBittorrent 4's `"Fails."` body on duplicate or rejected torrents.
- Changing the tag format away from `GrabId` breaks `grabOf`, making `watchDownloads` ignore active downloads and `remove` unable to find torrents to release.
- Taking the top 20 Prowlarr results overall instead of 10 per kind hides the less-seeded edition format on popular titles.

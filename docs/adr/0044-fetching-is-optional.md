# Make book fetching optional with empty setting defaults

## Decision

Every environment setting used for fetching defaults to `""`:

- `PROSODY_DOWNLOADS` (`packages/server/src/Host.ts`)
- `INDEXER_URL` and `INDEXER_API_KEY` (`packages/server/src/ProwlarrIndexer.ts`)
- `DOWNLOADS_URL`, `DOWNLOADS_USERNAME` and `DOWNLOADS_PASSWORD` (`packages/server/src/QBittorrent.ts`)

When those settings are empty:

- `Press` (`packages/press/src/Press.ts`) does not mount `/downloads`.
- `watchDownloads` (`packages/press/src/Watch.ts`) checks `isSetUp` (`DOWNLOADS_URL !== ""`) and returns immediately without contacting qBittorrent.
- Any search in `ProwlarrIndexer` or download/remove in `QBittorrent` fails cleanly with `NOT_SET_UP = "Fetching is not set up on this host"`, which the desk renders like any other failed search.
- The desk still accepts wants (`WantBook`) and catalogues them through Open Library, Audible and Audnexus.

## Why

Prosody's primary job is syncing and reading books already in a reader's library; many hosts will not run Prowlarr or qBittorrent. Requiring placeholder URLs and credentials in `.env` forced first-time deploys to invent fake values for services they never intend to run.

## What breaks if you change this

- Removing the empty defaults in `Host.ts`, `ProwlarrIndexer.ts` or `QBittorrent.ts` breaks `pnpm run plan` and `pnpm run deploy` on hosts that only want a library reader.
- Removing the `downloads === ""` check in `Press.ts` tries to bind-mount an empty host path into Docker.
- Removing the `isSetUp` guard in `Watch.ts` logs failed qBittorrent sign-in errors every minute on hosts without fetching configured.

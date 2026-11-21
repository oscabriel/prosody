# How acquiring works

Architecture, invariants and edge cases for the desk, `packages/domain/src/Acquisition`, the Prowlarr and qBittorrent adapters, and shelving. For terminology, see [`GLOSSARY.md`](GLOSSARY.md); for host setup, see [`README.md`](README.md).

## End-to-end flow

1. **Want**: The desk at `/desk` mints a `WorkId` (`w-` plus 12 random hex digits) and sends `WantBook`.
2. **Catalogue and search (in parallel)**:
   - `Cataloguing` (`packages/domain/src/Library/Cataloguing.policy.ts`) calls `Metadata.describe` once and sends `CatalogueWork` with `shelfmark: null`.
   - `ReleaseSearch` (`packages/domain/src/Acquisition/ReleaseSearch.policy.ts`) calls `Indexer.search` and sends `OfferReleases` or `RecordSearchFailed`.
3. **Grab**: The user clicks **Grab**, sending `GrabRelease` to `Want`. `Grabbing` sends `StartDownload` to a new `Grab` (`<work>.<n>`), and `Downloading` calls `Downloads.download`.
4. **Watch**: Every minute, `watchDownloads` (`packages/press/src/Watch.ts`) polls qBittorrent and sends `RecordProgress`, `RecordStall`, `RecordPayloadArrived` and `RecordSeeding` to the Api's `/press` endpoint.
5. **Shelve**: On `PayloadArrived`, `Shelving` (`packages/domain/src/Library/Shelving.policy.ts`) resolves and claims a shelfmark via `ShelfmarkClaim`, then calls `Stacks.shelve` (`POST /shelve` on the press). The press copies the single `.epub` or `.m4b` into the library, sends `RecordShelved`, and immediately walks the library.
6. **Release**: Once `seeded >= OBLIGATION.hours`, the user clicks **Release**, sending `ReleasePayload`. `Releasing` calls `Downloads.remove` with `deleteFiles: "false"`.

## The desk and wanting

### Route, UI and ids

- The desk lives at `/desk` ([`packages/web/src/Route.ts`](../../packages/web/src/Route.ts), [`packages/web/src/Desk.ts`](../../packages/web/src/Desk.ts)). It uses the shared colour tokens in [`packages/web/src/style.css`](../../packages/web/src/style.css) with a system sans-serif font and no reading-room leaf sidebar.
- `MintWork` in [`packages/web/src/Wants.ts`](../../packages/web/src/Wants.ts) generates `WorkId` values as `w-` followed by 12 random lowercase hex digits (`crypto.getRandomValues(new Uint8Array(6))`).
- `WorkId` ([`packages/domain/src/Library/Work.id.ts`](../../packages/domain/src/Library/Work.id.ts)) validates `/^w-[a-z0-9]+$/u`. Invalid ids are rejected by the Api and fall through to `AppRoute.NotFound` on `/read/<work>`.
- The desk subscribes to the `Wanted` view ([`packages/domain/src/Acquisition/Wanted.view.ts`](../../packages/domain/src/Acquisition/Wanted.view.ts)), which folds `Want`, `Work` and `Grab` under the single `SHELF` key (`"main"`).

### Want aggregate and search lifecycle

[`packages/domain/src/Acquisition/Want.aggregate.ts`](../../packages/domain/src/Acquisition/Want.aggregate.ts) is keyed by `WorkId`:

- `WantBook` emits `BookWanted` and `SearchStarted({ search: want.search + 1 })`. If already wanted, it is a no-op.
- `SearchAgain` increments `search` and emits `SearchStarted` (rejects with `NotWanted` if withdrawn).
- `WithdrawWant` emits `WantWithdrawn`, removing the want and its catalogue entry from `Wanted`.
- `OfferReleases` and `RecordSearchFailed` only emit events when `want.isWanted && want.search === cmd.search`. Stale search results and answers for withdrawn wants are silently dropped.
- Failed searches are never retried automatically; the user clicks **Search again**.
- Before a wanted work is shelved, the user can click **Correct the title** (`CorrectTitle` in [`packages/domain/src/Library/CorrectTitle.command.ts`](../../packages/domain/src/Library/CorrectTitle.command.ts), handled in [`packages/web/src/Correcting.ts`](../../packages/web/src/Correcting.ts)). This updates `Work` and `Wanted.catalogue`, which changes the shelfmark used when a payload is shelved. Once shelved, `CorrectTitle` rejects with `OnTheShelf`.

### Prowlarr indexer adapter

[`packages/server/src/ProwlarrIndexer.ts`](../../packages/server/src/ProwlarrIndexer.ts) implements `Indexer`:

- Reads `INDEXER_URL` and `INDEXER_API_KEY` from config (both default to `""`). If `INDEXER_URL` is empty, fails with `IndexerFailed("Fetching is not set up on this host")`.
- Sends one `GET ${url}/api/v1/search` with `query: "${title} ${author}"`, `type: "search"`, `categories: [3030, 7020]`, `limit: 100`, header `X-Api-Key`, and a 1-minute timeout (`SEARCH_TIME`).
- Maps category ranges `3000`–`3999` to `"audio"` and `7000`–`7999` to `"text"`. Drops results outside those ranges or missing `downloadUrl`.
- Keeps up to `10` most-seeded audio offers and `10` most-seeded text offers, then sorts the combined list by `seeders` descending.
- Sets each release's `id` to `${indexerId}_${guid}`. Strips `apikey` from `downloadUrl` and stores the path + query string in `release.link` so the API key never enters an event.
- Any network timeout, non-200 status (`401` reports `"Prowlarr refused its API key"`), or decode error becomes `IndexerFailed`, which `ReleaseSearch` turns into `RecordSearchFailed` rather than crashing the policy.

### Cataloguing wanted works

`Cataloguing` ([`packages/domain/src/Library/Cataloguing.policy.ts`](../../packages/domain/src/Library/Cataloguing.policy.ts)) reacts to `BookWanted`, calls `Metadata.describe` ([`packages/server/src/OpenLibraryMetadata.ts`](../../packages/server/src/OpenLibraryMetadata.ts)), and sends `CatalogueWork` with `shelfmark: null`:

- **Open Library** (`https://openlibrary.org/search.json`): 8-second timeout (`OPEN_LIBRARY_TIME`) with `Effect.orDie`. The timeout is intentionally under the platform's 10-second policy backstop so a failure is retried by the backstop rather than orphaned.
- **Name completion**: `completes(asked, found)` only accepts a title or author from Open Library if every normalised word of what the user typed appears in the result (for example, `weir` completes to `Andy Weir`, whereas `Homer` is never replaced by `Ὅμηρος`).
- **Audiobook recording**: queries Audible's catalogue (`https://api.audible.com/1.0/catalog/products`) for an exact normalised title match to get an ASIN (Audnexus has no search endpoint), then fetches book metadata and chapters from Audnexus (`https://api.audnex.us/books/<asin>`). This whole lookup has a 30-second timeout (`RECORDING_TIME`) and falls back to `null` on failure.
- None of the three services requires an account, and only title and author are sent.
- `Shelf` ([`packages/domain/src/Library/Shelf.view.ts`](../../packages/domain/src/Library/Shelf.view.ts)) ignores `WorkCatalogued` when `shelfmark === null`, so wanted books stay off the shelf until shelved. Works discovered by a library walk are catalogued with `description: null`.

## Grabs, downloads and seeding

### Grab lifecycle

- **User-only grabbing**: No policy sends `GrabRelease`. `Want` checks that the book is still wanted, the release has not already been grabbed (`want.grabbed`), and the release is in `want.offers` (otherwise `ReleaseNotOffered`). Offers recorded before `release.link` existed display `"search again to grab it"` on the desk.
- `Want` allocates `GrabId` as `<work>.<want.grabbed.length + 1>` and emits `ReleaseGrabbed`. `Grabbing` sends `StartDownload` to `Grab`, and `Downloading` calls `Downloads.download`.
- [`packages/domain/src/Acquisition/Grab.aggregate.ts`](../../packages/domain/src/Acquisition/Grab.aggregate.ts) enforces monotonic, idempotent transitions:
  - `RecordProgress` only emits when `status` is `"downloading"` or `"stalled"` and `percent > grab.percent`. Progress on a stalled grab transitions it back to `"downloading"`.
  - `RecordStall` only emits when `status === "downloading"`.
  - `RecordPayloadArrived` only emits when downloading or stalled, setting `status: "arrived"` and `percent: 100`.
  - `RecordSeeding` only emits when `status === "arrived"` and `hours > grab.seeded`.
  - `RecordShelved` and `RecordNotShelved` only apply once `payload !== null` and `!isShelved`; duplicate `RecordNotShelved` notes are ignored.
- `ResumeGrab` is accepted whenever `status` is `"downloading"` or `"stalled"`. It emits `GrabResumed`, which triggers `Downloading` to call `Downloads.download` again.
- `AbandonGrab` is accepted whenever `status` is `"downloading"` or `"stalled"`. It emits `GrabAbandoned`, removing the grab from `Wanted.grabs` and causing `Grab` to ignore all future reports from the press watch. It does not touch qBittorrent, and `Want` keeps the release in `want.grabbed` so it cannot be grabbed again on that want.

### qBittorrent adapter and press watch

[`packages/server/src/QBittorrent.ts`](../../packages/server/src/QBittorrent.ts) and [`packages/server/src/QBittorrentDownloads.ts`](../../packages/server/src/QBittorrentDownloads.ts) talk to qBittorrent's Web API:

- Every operation signs in afresh with `DOWNLOADS_URL`, `DOWNLOADS_USERNAME` and `DOWNLOADS_PASSWORD` (15-second timeout per request, `Origin` and `Referer` set to `DOWNLOADS_URL` for qBittorrent 5 CSRF checks, forwarding whatever session cookie qBittorrent sets).
- `Downloads.download`: looks up torrents by tag `grab`.
  - If a torrent already exists, sends `POST /api/v2/torrents/start` and `POST /api/v2/torrents/reannounce`.
  - Otherwise, fetches `.torrent` bytes from Prowlarr via `torrentOf(release.link)` and uploads them to `POST /api/v2/torrents/add` with `category = DOWNLOADS_CATEGORY` (default `"books"`) and `tags = grab`.
  - Any failure becomes `DownloadsFailed`, which `Downloading` records as a stall via `RecordStall`.
- `watchDownloads` ([`packages/press/src/Watch.ts`](../../packages/press/src/Watch.ts)) runs every minute (`Schedule.spaced("1 minute")` in [`packages/press/src/Press.ts`](../../packages/press/src/Press.ts)). If `DOWNLOADS_URL` is empty (`isSetUp` is false), it returns immediately. Otherwise it lists torrents in `DOWNLOADS_CATEGORY`, matches each by a `GrabId` tag (`grabOf`), and reports progress, stalls, arrival and seeding hours.
- Stall conditions (`stallOf` in `QBittorrent.ts`):
  - `error` -> `"qBittorrent reports an error with it"`
  - `missingFiles` -> `"qBittorrent can't find its files"`
  - `stoppedDL` or `pausedDL` -> `"It was stopped in qBittorrent"`
  - `stalledDL`, `metaDL` or `forcedMetaDL` with `now - max(last_activity, added_on) >= 1800` (30 minutes) -> `"Nothing has come for half an hour"`
- When `progress >= 1`, `payloadOf` strips `save_path` from `content_path` to produce the relative payload path, and `hours` is `Math.floor(seeding_time / 3600)`.

### Seeding gate and release

- `OBLIGATION` (`{ hours: 72, days: 30 }`) lives in [`packages/domain/src/Acquisition/ReleasePayload.command.ts`](../../packages/domain/src/Acquisition/ReleasePayload.command.ts) so the domain aggregate and the web desk share one constant.
- `ReleasePayload` rejects with `StillObligated({ hours })` until `grab.status === "arrived"` and `grab.seeded >= OBLIGATION.hours` (or `NotDownloading` for `"none"` / `"abandoned"`).
- On `PayloadReleased`, `Releasing` ([`packages/domain/src/Acquisition/Releasing.policy.ts`](../../packages/domain/src/Acquisition/Releasing.policy.ts)) calls `Downloads.remove`, which deletes every torrent tagged with `grab` using `deleteFiles: "false"`.

## Shelving

### Claiming a shelfmark

On `PayloadArrived`, `Shelving` ([`packages/domain/src/Library/Shelving.policy.ts`](../../packages/domain/src/Library/Shelving.policy.ts)):

1. Resolves the shelfmark (`shelfmarkFor`): uses `work.shelfmark` if set, else `shelfmarkOf(work.author, work.title)` ([`packages/domain/src/Library/Shelfmark.ts`](../../packages/domain/src/Library/Shelfmark.ts), which replaces `:` with ` -`, strips path-unsafe characters, and collapses whitespace), else falls back to `wants.get(work)` + `metadata.describe` for works created before `Work` stored title/author.
2. Sends `ClaimShelfmark({ work })` to `ShelfmarkClaim` ([`packages/domain/src/Library/ShelfmarkClaim.aggregate.ts`](../../packages/domain/src/Library/ShelfmarkClaim.aggregate.ts)), keyed by the shelfmark. The first work to claim a shelfmark owns it; later claims receive `ShelfmarkTaken({ work: owner })`.
3. Calls `Stacks.shelve` ([`packages/server/src/PressStacks.ts`](../../packages/server/src/PressStacks.ts) -> `POST http://press:3000/shelve`) with the owning `work` id. If an ebook is already on the shelf and you grab its audiobook, the audiobook is shelved under the existing work's id so the two pair.

### Copying files in the press

- The press mounts `PROSODY_LIBRARY` writable (as its sole writer) and `PROSODY_DOWNLOADS` read-only at `/downloads` ([`packages/press/src/Press.ts`](../../packages/press/src/Press.ts)).
- `POST /shelve` persists the request to `<COPIES>/.pending/<grab>.shelve.json` ([`packages/press/src/Pending.ts`](../../packages/press/src/Pending.ts)) and enqueues it on `pending.shelving`, separate from `pending.waiting` so shelving does not wait behind alignment or copying.
- `Stacks.shelve` ([`packages/press/src/Stacks.ts`](../../packages/press/src/Stacks.ts)):
  1. Checks that the library responds within 8 seconds (`MOUNT_TIME`), contains both `ebooks` and `audiobooks`, and that `/downloads` responds within 8 seconds. Failures return `StacksUnavailable`.
  2. Validates that `payload` is non-empty with no `..` segments and that `shelfmark` has exactly two clean segments (`<Author>/<Title>`). Violations return `Unshelvable`.
  3. Searches the payload (single file or recursively if a directory) for `.epub` (`text`) or `.m4b` (`audio`). Requires exactly one match; 0 or more than 1 returns `Unshelvable`.
  4. Targets `<library>/<ebooks|audiobooks>/<Author>/<Title>/<Title> - <Author>.<ext>`. If a file with that extension already exists in the folder with the same name and byte size, it is treated as an already-completed copy; otherwise returns `Unshelvable`.
  5. Copies to `.<file>.part` and renames to `<file>` so a library walk never sees a partial file. Any filesystem `PlatformError` becomes `StacksUnavailable`.
- **Outcomes in `Press.ts`**:
  - **Success**: sends `RecordShelved` (retried up to 30 times every 10 seconds via `persistently`), immediately runs `walk()`, and removes the `.pending` file.
  - **`StacksUnavailable`**: logs a warning, sends `RecordNotShelved`, keeps the `.pending` file on disk, and forks a 5-minute delay to re-enqueue the request so other shelving requests behind it are not blocked.
  - **`Unshelvable`**: sends `RecordNotShelved` via `persistently` and removes the `.pending` file (permanent failure).

## Known limits

- **Payload outside save path** ([`docs/issues/0001-payload-outside-save-path.md`](../issues/0001-payload-outside-save-path.md)): `payloadOf` in `QBittorrent.ts` returns `""` when `content_path` does not start with `save_path`, causing shelving to fail permanently as `Unshelvable`.
- **Failed release is not retried** ([`docs/issues/0007-released-payload-not-retried.md`](../issues/0007-released-payload-not-retried.md)): `ReleasingLive` logs a warning and finishes if `Downloads.remove` fails. Because `Grab` is already `"released"`, the torrent remains in qBittorrent until removed by hand.
- **Desk commands lost offline** ([`docs/issues/0011-desk-commands-lost-offline.md`](../issues/0011-desk-commands-lost-offline.md)): Unlike reading places, desk commands (`Wants.ts`, `Correcting.ts`, `Grabs.ts`) are not queued offline; a lost response shows an error and must be sent again.
- **Re-wanting the same `WorkId` loses its catalogue entry in `Wanted`**: `WantWithdrawn` removes `catalogue[work]` from `Wanted`. If `WantBook` is later sent for that same `WorkId`, `Work.aggregate.ts` ignores `CatalogueWork` because `work.catalogued` is already `true` and `shelfmark` is `null`. (Wanting the book again from the web desk mints a fresh `WorkId`, so it does not hit this.)
- **Resuming on qBittorrent 4**: `QBittorrentDownloads.ts` calls `/api/v2/torrents/start` when resuming an existing torrent, which is a qBittorrent 5 endpoint (qBittorrent 4 used `/api/v2/torrents/resume`).

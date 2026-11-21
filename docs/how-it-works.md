# How Prosody works

What the source does not show about each part: why it is built this way, and what breaks when it changes. Jump to the section for the part you are editing; each stands on its own.

Terms follow [`GLOSSARY.md`](../GLOSSARY.md). For host setup and assumptions, see [`hosting.md`](hosting.md). For fetching books at the desk, see [`acquiring/`](acquiring/README.md). Single decisions live in [`adr/`](adr/) and known hacks in [`issues/`](issues/).

## Deploying

Prosody deploys to a Docker Swarm host with `pnpm run deploy --yes` (preview changes with `pnpm run plan`). Swarm mode must be enabled, and Alchemy must run under Bun (`bunx --bun alchemy`); this stack does not load under Node.

### Web build and `PageImage`

`pnpm run deploy` and `pnpm run plan` build `packages/web` first. Running plain `alchemy deploy` skips that step, leaving the Api serving stale files.

`PageImage` ([`packages/server/src/Page.ts`](../packages/server/src/Page.ts)) builds [`packages/web/Dockerfile`](../packages/web/Dockerfile) and tags it with a hash of `packages/web/dist` and the Dockerfile so changes to either redeploy the Api ([ADR 0019](adr/0019-redeploy-by-fingerprint.md)). The Api serves:

| Path | File served | `cache-control` |
|---|---|---|
| `/`, `/read/<work>`, `/desk` | `/page/index.html` | `no-cache` |
| `/assets/<file>` | Hashed build assets | `public, max-age=31536000, immutable` ([ADR 0034](adr/0034-built-files-kept-a-year.md)) |
| `/worker.js`, `/manifest.webmanifest`, top-level `.png` icons | File from `/page/` | `no-cache` |

For local UI work, `pnpm --filter @prosody/web dev` binds `127.0.0.1:3022`. If you serve it behind Caddy on a private host name, set `CADDY_DEV_HOST` in `packages/web/.env` so Vite adds it to `allowedHosts` and points HMR at `wss` on port 443 ([`packages/web/vite.config.ts`](../packages/web/vite.config.ts)).

### Alchemy lifecycle traps

Four behaviours of Alchemy 2.0.0-beta.87 shape how services are written here:

- **Plan runs service setup on the host.** Anything that touches container files, mounts or background loops must go inside `host.run` (`ServerHost` in [`packages/press/src/Press.ts`](../packages/press/src/Press.ts)), not in the top-level service setup ([ADR 0018](adr/0018-host-facts-are-settings.md)).
- **Containers re-run their settings effect at startup without `.env` or source.** Inside a running container, a required host setting with no default reads as `""` ([`packages/server/src/Host.ts`](../packages/server/src/Host.ts), [issue 0013](issues/0013-host-setting-empty-in-container.md)), and `fingerprintOf` reads as `"none"` ([`packages/server/src/Source.ts`](../packages/server/src/Source.ts)).
- **Code-only changes can be missed.** When a service's settings depend on other resources, Alchemy 2.0.0-beta.87 does not redeploy it on a code-only change. Both Api and Press pass `PROSODY_SOURCE` (from `sourceFingerprint` in [`packages/server/src/Source.ts`](../packages/server/src/Source.ts)) in their environment; any new service needs the same ([ADR 0019](adr/0019-redeploy-by-fingerprint.md), [issue 0003](issues/0003-source-fingerprint-workaround.md)).
- **`Config` binds to whatever resource is being built.** The Api builds the model's Layer, while the runner rebuilds it at run time from its own environment. So `Runners` in [`packages/server/src/ProsodyLive.ts`](../packages/server/src/ProsodyLive.ts) reads the desk's fetching settings where the pool is declared, giving them to the runner alone and never to the Api. The press reads the settings it needs for its watch in [`packages/press/src/Press.ts`](../packages/press/src/Press.ts). Any new setting a runner policy needs must be read in `Runners` the same way, or the runner fails on startup (check with `docker service inspect`).

### Stop-first replacement and Bun connections

Swarm replaces services stop-first. For a few seconds during a deploy, `prosody-api` has no running task, and calls to `http://prosody-api:3000` can resolve to the calling container itself. Bun's HTTP client would reuse that keep-alive connection long after the Api returns, so the press sets `keepalive: false` on every call to the model (`freshConnections` in [`packages/press/src/Press.ts`](../packages/press/src/Press.ts), [ADR 0020](adr/0020-press-reconnects-and-repeats.md)). Give any new Bun-to-service client the same option.

Because the press can start a walk while the Api is mid-replacement, the first walk after a deploy is often refused with `RpcClientError`; the next walk, five minutes later, goes through.

## Signing in

Prosody has no user accounts. Identity comes from Tailscale through Caddy's `forward_auth` ([ADR 0014](adr/0014-sign-in-is-the-tailnets.md)).

### Request flow and trust boundaries

1. Caddy sends every request for the app's host name to the Api's `/auth` with `X-Prosody-Peer` set to the client's address.
2. `/auth` ([`packages/server/src/Session.ts`](../packages/server/src/Session.ts)) checks:
   - TLS early data with an empty peer header returns `425` (`Too early`).
   - Cross-site requests (mismatched `Origin` or cross-site/same-site `Sec-Fetch-Site` other than a top-level document navigation) are refused with `403`, because the tailnet vouches for a machine, not for other sites open in its browser ([ADR 0015](adr/0015-other-sites-pages-refused.md)).
   - `Tailscale.admit` ([`packages/server/src/Tailscale.ts`](../packages/server/src/Tailscale.ts)) queries `tailscaled` over its Unix socket and admits only an untagged machine owned by the host's own user, caching results for 30 seconds (transport failures are not cached).
3. On admission, `/auth` returns `X-Prosody-Device` with the machine's name. Caddy copies that header onto the forwarded request, overwriting anything the browser sent.
4. `SessionLive` refuses `/api` requests without `X-Prosody-Device` with `SignedOut` and provides `Device` to `decide`. `/copies/` returns `401` (`Signed out`) without it.

Keep two boundaries intact:

- **One Caddy host name behind `forward_auth`.** The relay ([`alchemy.run.ts`](../alchemy.run.ts)) listens on loopback only ([ADR 0016](adr/0016-relay-is-the-one-door.md)). Anything on the host that calls the relay directly can supply any `X-Prosody-Device`; nothing off the host can reach it. Adding a second Caddy route straight to the relay without `forward_auth` would let a browser spoof `X-Prosody-Device`.
- **`/press` is internal only.** The Api rejects any `/press` request carrying `x-forwarded-for` with `404` ([`packages/server/src/Api.ts`](../packages/server/src/Api.ts)), blocking everything that comes through the relay.

### `tailscaled` socket and `USER nobody`

The Api bind-mounts `/var/run/tailscale` read-only and runs as `USER nobody` ([`packages/web/Dockerfile`](../packages/web/Dockerfile)). `tailscaled` accepts configuration changes from root and its operator over that socket and only answers read queries from anyone else; a read-only bind mount does not restrict a Unix socket, so do not change `USER nobody` ([ADR 0017](adr/0017-api-runs-as-nobody.md)).

When `tailscaled` restarts, systemd recreates `/var/run/tailscale`, leaving the Api's mount stale. The Api's healthcheck (`test -S /var/run/tailscale/tailscaled.sock` every 10 seconds, 2 retries) then fails and Swarm replaces the task. `docker service update --force` on the Api does the same on demand.

## The model

`packages/domain` imports only `effect` and `@alchemy.run/domain`, enforced by the linter ([ADR 0001](adr/0001-model-knows-nothing-of-its-host.md)).

### Policies only see new events

Policies react to events emitted after they are deployed; they never replay history. Any rule that must also apply to existing books needs a live trigger. That is why the press re-reports every work, edition, pair and edition alone on every five-minute walk: commands like `PairEditions` and `CopyEdition` emit nothing when nothing has changed, and emit fresh events when a new rule needs them ([ADR 0006](adr/0006-press-reports-facts-every-walk.md)).

### Views and the `keyOf` backfill bug

On Alchemy 2.0.0-beta.87's Effect Cluster host:

- **Single-aggregate views** keyed directly by their aggregate (like `Place`, keyed by `Reading`) rebuild in place when their `version` is bumped.
- **Multi-instance views routed through `keyOf`** (`Shelf`, `Nightstand`, `Wanted`) cannot be backfilled. Their directory listing sends `after` as `null` instead of `undefined`, which matches no rows, so a new or version-bumped `keyOf` view starts empty ([issue 0004](issues/0004-views-cannot-be-rebuilt.md)). `Nightstand` started empty when added and fills as books are opened.
- Adding a new source aggregate to an existing `keyOf` view without bumping `version` works on this host (live events route to the view), provided all events from that new source are newer than the change. `Shelf` gained `Copy` this way.

### Schema evolution without migrations

Event history, stored aggregate/view state and `contents.json` files on disk are never migrated ([ADR 0007](adr/0007-stored-state-read-with-defaults.md)). When adding a field to stored state, give it a `Schema.withDecodingDefaultKey(...)` default, and never rename a stored key without `Schema.encodeKeys(...)`.

## The press

The press ([`packages/press`](../packages/press)) is the only service that touches book files, and it only ever adds copied files to the library ([ADR 0002](adr/0002-press-only-adds-to-the-library.md)).

### Base image and user

The press runs from [`packages/press/image/Dockerfile`](../packages/press/image/Dockerfile) as the UID in `PROSODY_UID` (default `1000`), which must own the library and copies folders on the host. The image bundles `ffmpeg`, `poppler-utils`, `@huggingface/transformers`, and pinned revisions of both speech models in `/models` so aligning runs offline ([ADR 0024](adr/0024-press-image-holds-its-models.md)). `@huggingface/transformers` is kept external in the service bundle (`Press.ts`) because it loads native libraries installed in `/app`.

Because the image is slow to build, its tag is bumped by hand via `IMAGE` in [`packages/press/src/Press.ts`](../packages/press/src/Press.ts). Bump `IMAGE` whenever the Dockerfile or either model changes, or the press keeps running the old image ([ADR 0019](adr/0019-redeploy-by-fingerprint.md)). A UID other than `1000` gets its own tag (`<IMAGE>-uid<uid>`).

### The walk, claims and titles

The library has two halves (`HALVES` in [`packages/press/src/Stacks.ts`](../packages/press/src/Stacks.ts)):

- `<PROSODY_LIBRARY>/ebooks/<Author>/<Title>/` (`.epub`, `.pdf`)
- `<PROSODY_LIBRARY>/audiobooks/<Author>/<Title>/` (`.m4b`)

On each walk, the press derives a deterministic `WorkId` (`w-` plus 12 hex characters of `sha256(shelfmark.normalize("NFC"))`) and sends `ClaimShelfmark`. The first work to claim a shelfmark owns it ([ADR 0004](adr/0004-first-claim-holds-a-folder.md)), so a folder shelved for a wanted book keeps the wanted work's id. When the walk first finds a wanted work that was catalogued without a shelfmark, `CatalogueWork` records it again with its shelfmark so it appears on the shelf.

`CorrectTitle` can change a wanted work's title and author until it is shelved (`OnTheShelf` after), because its folder is named from them. For older works stored before `Work` kept titles, `Shelving` ([`packages/domain/src/Library/Shelving.policy.ts`](../packages/domain/src/Library/Shelving.policy.ts)) falls back to asking `Metadata` with the want's title and author to name the folder.

The library may be a network share that hangs or appears empty; the walk skips unreadable folders rather than failing, and shelving checks both mounts answer within 8 seconds and that the library has both halves before copying ([ADR 0023](adr/0023-library-may-drop.md)).

### The on-disk queue (`.pending`)

Requests from the model are written to `/copies/.pending` and removed only after the press sends its answer ([`packages/press/src/Pending.ts`](../packages/press/src/Pending.ts), [ADR 0021](adr/0021-press-queue-on-disk.md)):

| Filename | Queue | Purpose |
|---|---|---|
| `<work>.json` | `waiting` (1 at a time) | Align a pair |
| `<work>.<attempt>.copy.json` | `waiting` (1 at a time) | Copy an edition alone |
| `<grab>.shelve.json` | `shelving` (separate line) | Shelve a fetched book |

Shelving runs in its own queue so it never waits behind a long alignment. On restart, `.pending` files are resumed in sorted filename order, so `<work>.<attempt>.copy.json` runs before `<work>.json` (which replaces it).

### Edition-alone copies vs pairs

A work with one edition is managed by the `Copy` aggregate (`packages/domain/src/Reading/Copy.aggregate.ts`):

- On every walk, the press sends `CopyEdition` for works without both text and audio. Re-sending the same kind, filename and byte size records nothing.
- Before calling the `Copier`, the `ReadingCopy` policy checks `editionToCopy` against `Work` (priority: `text`, then `pages`, then `audio`; `undefined` if both `text` and `audio` exist). Because `Work` never forgets an edition, a dropped mount hiding one half of a pair for a single walk cannot downgrade a synced copy or swap a text's copy for a PDF's ([ADR 0009](adr/0009-copy-from-one-edition.md)).
- `Copy` has no deadline; the press retries `RecordCopy` and `RecordCopyFailed` every 10 seconds for up to 30 tries (~5 minutes, `persistently` in `Press.ts`) so answers survive an Api deploy ([ADR 0020](adr/0020-press-reconnects-and-repeats.md)).
- A failed copy stays failed until either the file is replaced with a different size under the same filename (a different filename is rejected by `ShelveEdition` with `AlreadyShelved` before `CopyEdition` runs) or `RemakeCopy` is sent. On the shelf, a failed copy links to its reading room, which shows the failure reason and a retry button. An EPUB with no readable sentences fails with `its text has no sentences to read`.

### Reading copy layout, covers and section titles

The Api serves `/copies/<work>/` read-only ([`packages/server/src/Copies.ts`](../packages/server/src/Copies.ts)), exposing only `contents.json`, `timeline.json`, `cover.jpg`, `text/`, `pictures/` and `audio/` ([ADR 0022](adr/0022-copy-whole-once-contents-written.md)).

- **`contents.json`** is written last; a folder without it is unfinished, failed or predates the reading room, and the room offers `RealignNarration` or `RemakeCopy`. An open pair's room also offers `RealignNarration`, under **Synced** in its side panel. In the file, `audio` is `null` for text alone and pages; `sections` is encoded under the legacy key `pages` ([ADR 0007](adr/0007-stored-state-read-with-defaults.md)); `chapters` holds ffprobe chapters for audio alone (or one full-length chapter if none are embedded); `pictures` and `headings` hold PDF page images and outline entries. Only pairs have `timeline.json`.
- **Covers** (`cover.jpg`) are extracted with `ffmpeg`, scaled to at most 800 px tall ([`packages/press/src/Covers.ts`](../packages/press/src/Covers.ts)), from the EPUB's cover image, else the audio's embedded art, or for a PDF from its first rendered page. Copies made before cover support have none until remade; the shelf draws a plain binding with the title's first letter behind every cover as a fallback.
- **Section titles and filtering:** `Epub.open` reads the EPUB's NCX table of contents for section titles and falls back to the first `h1`–`h3` heading or `<title>` ([`packages/aligner/src/Epub.ts`](../packages/aligner/src/Epub.ts), [`packages/aligner/src/Sections.ts`](../packages/aligner/src/Sections.ts)). Non-narrated sections (covers, contents, indexes, colophons, etc.) are filtered out for both pairs and text alone so both kinds mark the same sections.

### The aligner and emissions

Alignment uses NVIDIA Parakeet CTC 0.6B (int8 ONNX) for acoustic emissions and Whisper `base.en` for the spot check ([ADR 0025](adr/0025-aligner-keeps-what-it-heard.md), [ADR 0028](adr/0028-second-model-listens.md)). The spot check must hear at least 75% of checked sentences (`4 * heard >= 3 * checked`, and `checked > 0`) or the alignment is refused ([`packages/press/src/ReadingCopies.ts`](../packages/press/src/ReadingCopies.ts)).

Emissions are cached beside the copy as `heard-<size>.emissions` so realigning never runs the speech model again. If you change the emissions binary format, invalidate or rebuild existing `heard-*` files.

`packages/aligner/bench/` runs the aligner outside the press on saved emissions: `run.ts` end to end, `emit.ts` to record emissions, `align.ts` to test alignment costs, `reorder.ts` and `unread.ts` for out-of-order audio or unread text, and `profile.ts` to benchmark inference.

## The reading room

### Places

`PlaceAt` ([`packages/domain/src/Reading/Sentence.ts`](../packages/domain/src/Reading/Sentence.ts)) has three nullable fields: `sentence` (for pairs and text alone), `time` in seconds (for audio alone) and `page` counted from 1 (for pages). Fields added later decode as `null` for older events ([ADR 0007](adr/0007-stored-state-read-with-defaults.md), [ADR 0008](adr/0008-a-place-is-a-sentence.md)).

- A book heard as audio alone and later paired opens at the sentence spoken at its kept `time` (`goToPlace` in [`packages/web/src/Steps.ts`](../packages/web/src/Steps.ts)).
- While audio plays (paired or audio alone), the place is kept every 15 seconds (`KEEP_EVERY` in [`packages/web/src/Places.ts`](../packages/web/src/Places.ts)) and on pause. In audio alone, moving the audio by more than 1 second while paused (chapter jump, skip or lock-screen seek) also keeps the place (`isMovedByHand` in [`packages/web/src/Rooms.ts`](../packages/web/src/Rooms.ts)).

### The nightstand

The nightstand is driven by `OpenBook`, `FinishBook` and `SetAside` on `Reading` and projected by the `Nightstand` view (keyed by `SHELF`, like `Shelf`).

`OpenBook` puts a finished or set-aside book back on the nightstand, so it is sent once a room's copy has opened (and retried on reconnect until `SucceededOpenBook`, tracked by `room.hasOpened`). Finishing a book or setting it aside navigates to the shelf with `replaceUrl` (`CloseRoom` in [`packages/web/src/Main.ts`](../packages/web/src/Main.ts)), never `pushUrl`, so reloading or pressing Back cannot land in the room and send `OpenBook` again ([ADR 0038](adr/0038-opening-is-something-you-did.md)). Readings stored before stages existed decode as `unopened` and join the nightstand the next time they are opened.

### Lock screen

[`packages/web/src/LockScreen.ts`](../packages/web/src/LockScreen.ts) sets `navigator.mediaSession.metadata` (title, author, current chapter and cover, falling back to `/icon-512.png`), and [`packages/web/src/Player.ts`](../packages/web/src/Player.ts) wires `play`, `pause`, `seekbackward` (15 s), `seekforward` (30 s) and `seekto` directly to the `<audio>` element. Works without audio (text alone and pages) render no player and touch nothing in `mediaSession`.

### Pages (PDF)

A work's `pages` edition is the first `.pdf` in its `ebooks/<Author>/<Title>/` folder. MOBI and CBZ files are ignored.

- **Press rendering** ([`packages/press/src/Pages.ts`](../packages/press/src/Pages.ts)): `pdftoppm` renders every page to `pictures/` as JPEG (quality 80, 1600 px on the longer side, roughly 250 KB per page; a 324-page book is about 82 MB on disk and 85 MB in the Cache API), and `pdftohtml -xml` extracts top-level outline entries as `headings`. The first page becomes `cover.jpg`. Any failure in `pdftoppm` fails the copy with its reason.
- **Navigation and zoom** ([`packages/web/src/Pages.ts`](../packages/web/src/Pages.ts)): One page is shown at a time. Tapping the left third or swiping right turns back; tapping elsewhere or swiping left turns on; `ArrowLeft`, `ArrowRight`, `PageUp` and `PageDown` also turn. Touch handling reads `touchstart`/`touchend` directly and ignores multi-touch or any touch while `visualViewport.scale > 1`, so a pinch-zoomed page pans without turning.
- **Keeping a page place:** The `Leaf` mount waits 1 second before emitting `ShowedPage`, so flipping through pages only records where you stop. Nothing is kept before `room.knowsPlace` is true or if the page matches the last kept page (`showedPage` in [`packages/web/src/Rooms.ts`](../packages/web/src/Rooms.ts)).
- **Keeping offline:** Page pictures are cached 6 at a time, skipping any picture already in the work's cache (`keepText` in [`packages/web/src/DeviceCopies.ts`](../packages/web/src/DeviceCopies.ts)).

## Offline

### Service worker

[`packages/web/src/Worker.ts`](../packages/web/src/Worker.ts) is built separately from the app bundle by the `worker` plugin in [`packages/web/vite.config.ts`](../packages/web/vite.config.ts), which injects `SHELL` (`/`, `/icon-512.png` and every file under `/assets/`). Only production builds register it (`import.meta.env.PROD` in [`packages/web/src/entry.ts`](../packages/web/src/entry.ts)); the dev server has none ([ADR 0035](adr/0035-service-worker-network-first.md)).

| Request | Strategy |
|---|---|
| Navigation to `/`, `/desk`, `/read/<work>` | Network first with a 3-second timeout, then cached `/` |
| URLs in `SHELL` | Cache first, then network |
| `/copies/<work>/...` (excluding `/audio/`) | Network first with a 3-second timeout, then any matching cache entry |
| `/copies/<work>/audio/...?kept` | Served from cached 8 MiB pieces (synthesising `200`/`206`/`416` byte ranges) |
| Everything else (including unkept audio and `/api`) | Untouched; goes straight to the network |

### Queued places and connectivity

Offline writes are queued intent ([ADR 0037](adr/0037-offline-is-queued-intent.md)):

- Each kept place is saved in `localStorage` under `prosody:places` along with its `commandId` ([`packages/web/src/Places.ts`](../packages/web/src/Places.ts)). When online, it is sent immediately; on reconnect or reload, every entry with a non-null `commandId` is resent. The `commandId` clears once the model accepts it or rejects it (for example with `StalePlace`).
- An `Unknown` transport failure marks the app offline and starts polling `HEAD /` every 5 seconds until a 2xx response returns; the browser's `online` event also triggers reconnection ([`packages/web/src/Connection.ts`](../packages/web/src/Connection.ts)).
- When opening a book online, the room waits up to 3 seconds (`WaitForPlace`) for the model's `Place` snapshot before settling on the device's own saved place.

Desk commands (wants, title corrections, grabs) are not queued offline ([issue 0011](issues/0011-desk-commands-lost-offline.md)).

### Kept copies

"Keep on this device" stores a work in its own Cache API bucket (`copy-<work>`, [`packages/web/src/OnDevice.ts`](../packages/web/src/OnDevice.ts), [`packages/web/src/DeviceCopies.ts`](../packages/web/src/DeviceCopies.ts), [ADR 0036](adr/0036-kept-copy-in-pieces.md)):

- It fetches `contents.json`, `timeline.json` (if synced), `cover.jpg`, text sections and their referenced assets, page pictures (6 at a time, skipping cached ones), and audio in 8 MiB range requests stored under `<audio>?piece=<n>` (skipping cached pieces).
- It writes `/copies/<work>/kept.json` last. A cache without `kept.json` is treated as incomplete, and keeping the work again resumes without re-downloading cached audio pieces or page pictures.
- Reported size is the audio byte length for works with audio, or the sum of cached blob sizes when `contents.audio === null` (text alone and pages, because Caddy compresses text responses and omits uncompressed lengths).
- When a room opens for a kept work, `<audio>` uses `<audio>?kept` (`Listening.ts`) for the whole visit. Mixing network and cache bytes on one media URL breaks browser media elements.

## The site

`packages/site` is the public landing page, docs and blog, deployed to Cloudflare by its own Alchemy stack (`packages/site/alchemy.run.ts`, [ADR 0045](adr/0045-the-site-is-its-own-stack.md)).

- **Prerender and hydrate:** `vite build` prerenders every path in `prerenderPaths` ([`packages/site/src/entry.server.ts`](../packages/site/src/entry.server.ts)) to static HTML, and the browser hydrates it with the same `view`. Keep `view` free of browser-only values or hydration will discard and rebuild the DOM.
- **Markdown content:** Docs (`packages/site/content/docs/`, ordered by `order`) and blog posts (`packages/site/content/blog/`, ordered newest-first by `date`) require non-empty `title` and `summary` frontmatter ([`packages/site/src/Frontmatter.ts`](../packages/site/src/Frontmatter.ts)). `@foldkit/markdown` validates frontmatter and Markdown during the build, and [`packages/site/test/Content.test.ts`](../packages/site/test/Content.test.ts) fails on broken internal links or em dashes.
- **Trailing slashes in preview:** Cloudflare serves `packages/site` with `htmlHandling: "drop-trailing-slash"`, mapping `/docs/installing` to `docs/installing/index.html`. `vite preview` does not do that: without a trailing slash it serves the root `index.html`, which the browser then reroutes. Judge a nested page's first paint on the deployed site or with a trailing slash.
- **Shared fonts:** [`packages/site/src/style.css`](../packages/site/src/style.css) loads the reader's font files via relative paths from `packages/web/src/fonts/`.

## Known limits

- **Audio format:** The press only scans for one `.m4b` per book (`Stacks.ts`). For alignment, `isDecodable` ([`packages/aligner/src/Audio.ts`](../packages/aligner/src/Audio.ts)) allows only `mp3` or `aac` (`LC` profile), rejecting codecs like xHE-AAC up front with `UndecodableAudio`, and `Aligner.ts` also checks decoded length against container duration (`AudioCutShort`, unless the container states no duration; see [issue 0009](issues/0009-no-stated-length-skips-check.md)). Audio-alone copies skip `isDecodable` and rely on browser playback.
- **Reading copies over 4 GB:** The EPUB writer in `packages/aligner/src/Overlay.ts` does not write ZIP64, so pairs whose combined copy exceeds 4 GB fail ([issue 0008](issues/0008-copies-over-4-gb.md)).
- **Remaking empties the copy first:** `freshFolder` in [`packages/press/src/ReadingCopies.ts`](../packages/press/src/ReadingCopies.ts) deletes the work's copy folder (keeping only `heard-<size>.emissions` when aligning, or `heard-*` when copying) before rebuilding, so the book cannot be opened while it is being remade ([issue 0002](issues/0002-remaking-a-copy-empties-it.md)).
- **Queue time counts toward the alignment deadline:** An alignment's 6-hour window starts when requested rather than when the press begins work, so a large batch of new pairs can expire in the queue ([issue 0006](issues/0006-deadline-counts-queue-time.md)).
- **Phone audio is only lightly tested:** Background playback, lock-screen controls and offline playback were only verified on an iPhone in a prototype for runs of one to four minutes. Long sessions, interruptions (calls, other apps, Bluetooth), iOS cache eviction and Android are untested.
- **Chapter jump on narrow screens:** Choosing a chapter from the folded contents in a text or synced book calls `ToTop()`, which scrolls to the top of the document (above the folded leaf on a phone) rather than to the text itself. Pages books scroll the page into view (`Show({ id: PRINTED })`).

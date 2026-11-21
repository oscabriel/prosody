# Store kept copies in per-work caches, fetch audio in 8 MiB pieces, and write kept.json last

## Decision

`"Keep on this device"` (`packages/web/src/DeviceCopies.ts`, `packages/web/src/OnDevice.ts`) stores each work in its own Cache Storage bucket (`copy-<work>`):

1. Caches `contents.json`, `timeline.json`, `cover.jpg`, text sections and their referenced images, and PDF pictures (skipping already-cached items).
2. For copies with audio, probes total size with `Range: bytes=0-0` and fetches the audio in 8 MiB pieces (`PIECE = 8 * 1024 * 1024`) under `<audioUrl>?piece=<index>`, skipping pieces already cached. Because Cache Storage rejects `206` responses, each piece is stored as a `200` `Response` carrying the original headers (`content-range`, `content-type`, etc.).
3. Writes `/copies/<work>/kept.json` last with `{ title, author, bytes }`: the probed audio size for audio copies, or the sum of cached blob sizes (`keptSize`) for non-audio copies. `savedCopies` treats a cache as complete only when `kept.json` exists and decodes cleanly.

## Why

- Splitting large audiobooks into 8 MiB pieces keeps memory bounded and lets interrupted downloads resume without re-fetching earlier pieces.
- Wrapping each `206` piece in a `200` `Response` works around the Cache API's rejection of `206 Partial Content` while preserving `content-range` (needed by `Worker.ts` to know total audio length).
- Writing `kept.json` last guarantees a half-downloaded copy is never mistaken for a complete kept copy.
- Measuring non-audio copies by summing cached blob sizes avoids relying on `content-length`, which compressed HTTP responses omit.

## What breaks if you change this

- Calling `cache.put(key, response)` directly with a `206` fetch response throws a `TypeError` in the browser Cache API.
- Writing `kept.json` before all pieces finish causes `savedCopies` and `room.isKeptHere` to treat an incomplete cache as ready offline, leading to audio playback errors.
- Dropping the `content-range` header when storing piece 0 breaks `Worker.ts`'s `keptAudio`, which reads total file size from piece 0's `content-range` header.
- Changing `PIECE` invalidates any in-progress or already-kept audio caches on existing devices.

# Persist the press queue on disk and process reading copies one at a time

## Decision

`Pending` (`packages/press/src/Pending.ts`) writes every incoming `/align`, `/copy` and `/shelve` request to `/copies/.pending/` before queueing it in memory, removing the file only after reporting the outcome (`pending.done`). Filenames deduplicate repeat requests and control startup order (`toSorted()`): `<work>.<attempt>.copy.json` sorts before `<work>.json`, so a work's copy runs before an alignment that replaces it; shelve requests use `<grab>.shelve.json`.

Two loops run in `packages/press/src/Press.ts`:

- `pending.waiting` runs alignments and edition-alone copies one at a time.
- `pending.shelving` runs shelving in its own loop, re-queueing after `"5 minutes"` on `StacksUnavailable`.

## Why

- Keeping pending requests on disk lets the press resume queued work immediately after a container restart or deploy instead of waiting out a 6-hour alignment deadline.
- Running reading copies one at a time avoids CPU contention because the aligner uses every physical core.
- Giving shelving its own queue prevents copying a newly downloaded book into the library from waiting behind an hour-long alignment.
- Backing off 5 minutes on `StacksUnavailable` avoids busy-looping while a network share is down.

## What breaks if you change this

- Holding the queue only in memory drops in-flight and queued requests whenever `Press` restarts.
- Running multiple alignments concurrently causes ONNX Runtime threads to thrash across cores and slows every alignment down.
- Merging shelving into `pending.waiting` delays newly downloaded books from appearing on the shelf until all queued alignments finish.
- Changing the filename pattern can break both deduplication and the sort order that puts copy requests before align requests.

# Released payload is not retried when Downloads is unreachable

**Where:** `ReleasingLive` in `packages/domain/src/Acquisition/Releasing.policy.ts`

## What is wrong

When a reader releases a payload, `Grab` records `PayloadReleased` and moves to `status: "released"`. `ReleasingLive` reacts to `PayloadReleased` by calling `downloads.remove({ grab: source.id })`, but catches `DownloadsFailed` with `Effect.catchTag("DownloadsFailed", Effect.logWarning)` and succeeds anyway.

## What it costs

If qBittorrent is unreachable or returns an error when `ReleasingLive` runs, nothing retries the removal. Because `Grab` is already in `status: "released"`, calling `ReleasePayload` again is a no-op, and the torrent stays in qBittorrent seeding until removed by hand.

## How to fix

Either:

- Stop catching `DownloadsFailed` in `ReleasingLive` so the platform retries the policy until Downloads succeeds, or
- Record removal confirmation separately on `Grab` and have `watchDownloads` in `packages/press/src/Watch.ts` retry removing torrents whose grab is released but still present in qBittorrent.

# Payload outside category save path is recorded as empty

**Where:** `payloadOf` and `progressOf` in `packages/server/src/QBittorrent.ts` (consumed by `watchDownloads` in `packages/press/src/Watch.ts` and `Stacks.shelve` in `packages/press/src/Stacks.ts`)

## What is wrong

When a torrent reaches `progress >= 1`, `progressOf` derives the payload name with `payloadOf(torrent)`. That function strips `torrent.save_path` (with a trailing `/`) from the start of `torrent.content_path`. If `content_path` does not start with `save_path`, `payloadOf` returns `""`.

`watchDownloads` still sends `RecordPayloadArrived` with `payload: ""`. `Grab` records `payload: ""` and moves to `status: "arrived"`, so later polls never replace it. When shelving runs, `Stacks.shelve` rejects `request.payload === ""` with `Unshelvable` (`"Its files are not in a folder of their own in the downloads"`).

## What it costs

Any completed torrent whose files sit outside its category's `save_path` (for example, after a manual move in qBittorrent or a path mismatch) is permanently stuck as unshelvable. The desk reports a misleading shelving error instead of explaining that the download landed outside the downloads folder.

## How to fix

In `packages/server/src/QBittorrent.ts`, stop returning `""` as a valid payload. Either:

- Report a completed torrent whose `content_path` is outside `save_path` as a stall with a clear reason (so `watchDownloads` records a stall instead of `PayloadArrived`), or
- Resolve `content_path` against the downloads folder and report a stall if it still falls outside.

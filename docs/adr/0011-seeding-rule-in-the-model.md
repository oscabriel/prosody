# Define the seeding obligation as a domain constant

## Decision

The seeding obligation is defined as a constant in `packages/domain/src/Acquisition/ReleasePayload.command.ts`:

```ts
export const OBLIGATION = { hours: 72, days: 30 };
```

Both `Grab` (`packages/domain/src/Acquisition/Grab.aggregate.ts`) and the desk UI (`packages/web/src/Grabbed.ts`) import `OBLIGATION`. `ReleasePayload` rejects with `NotArrived` while the grab is `"downloading"` or `"stalled"`, and with `StillObligated` if `grab.seeded < OBLIGATION.hours`. Once met, `Releasing` (`packages/domain/src/Acquisition/Releasing.policy.ts`) calls `Downloads.remove`, which deletes the torrent from qBittorrent with `deleteFiles: "false"` (`packages/server/src/QBittorrentDownloads.ts`).

Because `grab.seeded` comes from qBittorrent's `seeding_time` (which can count time your tracker does not credit), the desk prompts: `qBittorrent has seeded it 72 hours. Check your tracker counts them before you release it.`

## Why

Putting `OBLIGATION` in the domain model rather than an environment variable guarantees that the aggregate enforcing `ReleasePayload` and the UI showing hours owed and the deadline always agree. Leaving `deleteFiles: "false"` preserves the payload in `/downloads`.

## What breaks if you change this

- Splitting the threshold between a server setting and a frontend constant risks the desk showing a "Release" button that the model rejects, or vice versa.
- Changing `deleteFiles` to `"true"` in `QBittorrentDownloads.ts` deletes downloaded payloads from disk.
- Removing the tracker-check warning in `Grabbed.ts` increases the chance of releasing a payload before your tracker has credited the required seed time.

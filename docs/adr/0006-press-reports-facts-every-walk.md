# The press reports current facts repeatedly, and the model records only changes

## Decision

On every walk (every 5 minutes in `packages/press/src/Press.ts`), the press sends `ClaimShelfmark`, `CatalogueWork`, `ShelveEdition`, and either `PairEditions` or `CopyEdition` for every work it finds in `/library`. Every minute, `watchDownloads` (`packages/press/src/Watch.ts`) reports the current progress, stall, arrival and seeding hours of every torrent in the configured category.

The model's reporting commands (`CatalogueWork`, `PairEditions`, `CopyEdition`, `RecordAlignment`, `RecordAlignmentFailed`, `RecordCopy`, `RecordCopyFailed`, `RecordProgress`, `RecordStall`, `RecordPayloadArrived`, `RecordSeeding`, `RecordShelved`, `RecordNotShelved`) return an empty event list when the reported fact changes nothing, rather than rejecting. (`ClaimShelfmark` and `ShelveEdition` still reject on conflicts, which `Press.report` handles explicitly.)

## Why

Policies only react to newly emitted events. Because the press reports the whole library and download list repeatedly without keeping its own diff state, a new policy or feature added later (such as edition-alone copies or PDF pages) automatically picks up works that were already in the library on the next walk. Making unchanged facts no-ops keeps the event log clean and lets the press stay stateless across restarts.

## What breaks if you change this

- Turning unchanged facts into rejections floods the press logs with errors on every 5-minute walk and 1-minute watch.
- Emitting duplicate events for unchanged facts retriggers downstream policies (re-aligning, re-copying or re-shelving) on every tick.
- Making the press send only deltas means newly added domain rules will miss books that were already on disk before the deploy.

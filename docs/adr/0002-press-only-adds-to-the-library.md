# Only the press touches book files, and it only adds to the library

## Decision

`Press` (`packages/press/src/Press.ts`) is the only service that mounts the library (`PROSODY_LIBRARY` at `/library`) and the downloads folder (`PROSODY_DOWNLOADS` at `/downloads`, mounted `readOnly: true`).

When shelving a payload (`packages/press/src/Stacks.ts`), the press copies the edition into `/library` under a temporary `.part` name and renames it into place once complete. It never moves, renames or deletes existing files in the library, and it never modifies or removes anything in the downloads folder.

## Why

- A downloaded payload must stay untouched where the download client saved it so it can keep seeding until its obligation is met.
- A library that Prosody only ever adds to cannot lose existing books to a bug, a bad shelfmark or a dropped network share.

## What breaks if you change this

- Mounting `/downloads` read-write or moving files out of it breaks active seeding in qBittorrent and can violate your tracker's obligation.
- Allowing the press or the Api to delete or overwrite files in `/library` turns a bug or a transiently empty mount into data loss in the reader's library.

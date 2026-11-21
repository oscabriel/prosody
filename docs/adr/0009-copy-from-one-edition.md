# Copy one edition when a work has no pair, and never downgrade on a missed folder

## Decision

When a work lacks both text and audio, `editionToCopy` (`packages/domain/src/Reading/CopyEdition.command.ts`) picks one edition to copy in priority order: `text`, else `pages`, else `audio`. A pair returns `undefined` because it is aligned instead.

Before dispatching to the press, `ReadingCopy` (`packages/domain/src/Reading/ReadingCopy.policy.ts`) reads the current `Work` aggregate and drops the event if `editionToCopy` for the work's known editions no longer matches `event.kind`.

In `Copy` (`packages/domain/src/Reading/Copy.aggregate.ts`), `CopyEdition` is a no-op when `kind`, `file` and `bytes` all match the last copied edition; a different byte size under the same filename starts a new try.

## Why

- Text is preferred over pages and audio because an EPUB is marked sentence by sentence and supports the richest reading room navigation.
- A network share that temporarily hides `ebooks/` or `audiobooks/` during one walk makes a paired work look like an edition alone; re-checking `Work` in `ReadingCopy` stops the press from overwriting an aligned pair with an unpaired copy.
- Keying idempotence on `(kind, file, bytes)` avoids rebuilding unchanged copies on every walk while still recopying when a file is replaced in place.

## What breaks if you change this

- Removing the `Work` re-check in `ReadingCopy` lets a single partial walk downgrade a synced work's reading copy in `/copies/<work>/` to an unpaired copy.
- Dropping `bytes` from `CopyEdition`'s deduplication check stops Prosody from picking up a corrected file saved under the same filename.
- Changing the priority order in `editionToCopy` alters which edition is copied and displayed for works that hold, for example, both an EPUB and a PDF.

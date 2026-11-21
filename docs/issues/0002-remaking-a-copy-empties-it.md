# Remaking a reading copy empties the folder first

**Where:** `freshFolder` in `packages/press/src/ReadingCopies.ts` (called by `ReadingCopies.make` and `ReadingCopies.copy`)

## What is wrong

Both `ReadingCopies.make` (for a pair) and `ReadingCopies.copy` (for an edition alone) call `freshFolder` at the start of a try. `freshFolder` deletes everything in `/copies/<work>` except the saved `heard-*.emissions` file (exact match in `make`, `heard-` prefix in `copy`), then builds the new reading copy in place. `contents.json` is written last, in `finish`.

## What it costs

From the moment a remake begins until `finish` writes `contents.json`, `GET /copies/<work>/contents.json` returns `404` (`serveCopy` in `packages/server/src/Copies.ts`) and `OpenCopy` in `packages/web/src/Copy.ts` treats the book as unmade. The book cannot be opened during that window: roughly a minute or two when realigning from saved emissions, and much longer on a first listen. If the try fails partway through, the previous working reading copy has already been deleted.

## How to fix

Build the new reading copy in a temporary sibling folder beside `/copies/<work>` (linking or keeping the `heard-*.emissions` file), and atomically swap it into `/copies/<work>` only after `contents.json` is written. Leave the existing folder untouched if the try fails.

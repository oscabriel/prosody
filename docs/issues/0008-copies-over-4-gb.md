# Reading copies over 4 GiB cannot be written

**Where:** `MOST_BYTES`, `TooLargeError`, and `writeReadingCopy` in `packages/aligner/src/Overlay.ts`

## What is wrong

`writeReadingCopy` packs the reading copy's EPUB 3 (`<work>.epub`) using `fflate`'s `Zip`, which does not support ZIP64. Before writing, `writeReadingCopy` sums the audio track file sizes and throws `TooLargeError` (`"the audio is <X> GB, and the archive holds 4"`) whenever the total exceeds `MOST_BYTES` (`2 ** 32 - 2 ** 26`, roughly 3.94 GiB, leaving 64 MiB for the rest of the EPUB under the 4 GiB ZIP32 limit).

## What it costs

Any pair whose audio exceeds `MOST_BYTES` fails alignment with `CopyFailed` even when alignment itself succeeds, leaving the book unreadable as a synced copy.

## How to fix

Either:

- Use a ZIP writer that emits ZIP64 headers when the archive exceeds the 32-bit limit, or
- Stop embedding the audio inside `<work>.epub` (the web reading room streams audio from `/copies/<work>/audio/`, though note `docs/adr/0032-reading-copy-is-epub-3.md` embeds it so `<work>.epub` is a standalone EPUB 3 for external readers).

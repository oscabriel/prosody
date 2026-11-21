# Stream decoded audio and archive writes instead of buffering whole books in memory

## Decision

Audio is never held whole in memory:

- **Decoding** (`packages/aligner/src/Audio.ts`): `Audio.samples` streams 16 kHz mono float32 PCM from `ffmpeg`'s `stdout` into `Acoustic.listen`'s rolling window, inherits `stderr` straight to the container log, and fails with `DecodeFailed` if `ffmpeg` exits non-zero.
- **Archiving** (`packages/aligner/src/Overlay.ts`): `writeReadingCopy` streams `<work>.epub` via `fflate`'s `Zip`, storing audio tracks uncompressed (`ZipPassThrough`) in 4 MiB chunks. Because `fflate` writes 32-bit ZIP headers without ZIP64, audio totals above `MOST_BYTES` (~4 GiB minus 64 MiB headroom) fail with `TooLargeError`.

## Why

- A 20-hour audiobook decoded to 16 kHz float32 PCM is ~4.6 GB in memory, and its `.m4b` container can exceed 1 GB; streaming both decode and ZIP output keeps the press's memory footprint bounded.
- Failing the stream when `ffmpeg` exits non-zero prevents a mid-file decode crash from looking like a shorter audiobook.
- Inheriting `stderr` prevents an unread `stderr` pipe buffer from filling up and deadlocking `ffmpeg`.
- Storing audio uncompressed avoids wasting CPU trying to deflate already-compressed AAC/MP3 audio.

## What breaks if you change this

- Collecting `ffmpeg`'s full `stdout` into a buffer causes out-of-memory crashes on long audiobooks.
- Ignoring `handle.exitCode` turns decode errors into silently truncated alignments.
- Piping `ffmpeg`'s `stderr` without draining it can hang `ffmpeg` mid-decode.
- Removing the `MOST_BYTES` check produces corrupt ZIP archives when a book's audio exceeds 4 GiB (tracked in `docs/issues/0008-copies-over-4-gb.md`).

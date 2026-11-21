# Audio file with no stated duration skips whole-decode check

**Where:** `wrongLength` in `packages/aligner/src/Aligner.ts` (fed by `Audio.probe` in `packages/aligner/src/Audio.ts`)

## What is wrong

To catch `ffmpeg` silently dropping audio during decoding, `Aligner` compares each track's decoded duration against its container duration via `wrongLength(heard.tracks, stated)`. `Audio.probe` reads `format=duration` from `ffprobe` and returns `seconds: 0` when the container states no finite duration. Because `wrongLength` checks `seconds > 0 && Math.abs(heard - seconds) > 1 + seconds / 1000`, any track with `seconds === 0` bypasses the check completely.

## What it costs

If an audiobook container omits its duration, a truncated or silently dropped `ffmpeg` decode passes `wrongLength` unnoticed, leading to a broken alignment or a late failure at the spot check.

## How to fix

When `Audio.probe` finds no finite duration (`seconds <= 0`), either fall back to another duration measure from `ffprobe` (such as counting packets or frames) or fail the probe with a clear error instead of returning `0`.

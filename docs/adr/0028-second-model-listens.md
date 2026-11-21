# Verify every alignment with Whisper spot checks and check decoded audio length

## Decision

Two independent checks guard against silent alignment or decode failures:

1. **Second-model spot check**: `SpotCheck.listen` (`packages/aligner/src/SpotCheck.ts`) transcribes up to 40 evenly spread aligned sentences (3 to 15 seconds long) with `onnx-community/whisper-base.en` and counts a clip as heard right at `>= 0.8` word-level likeness. `ReadingCopies.make` (`packages/press/src/ReadingCopies.ts`) refuses the alignment unless at least one clip was checked and three-quarters pass.
2. **Audio codec and length check**: `Audio.isDecodable` (`packages/aligner/src/Audio.ts`) admits only `mp3` or `aac` `LC` (refusing e.g. xHE-AAC as `UndecodableAudio`), and `wrongLength` (`packages/aligner/src/Aligner.ts`) fails with `AudioCutShort` if decoded duration disagrees with `ffprobe`'s stated duration.

## Why

- Forced alignment can complete cleanly and report high coverage even when the wrong audiobook or wrong edition was paired. Checking with a second model of a different family (Whisper encoder-decoder vs Parakeet CTC) catches wrong alignments: across benchmark runs, good books scored 37 to 40 out of 40 while bad alignments scored 0.
- `ffmpeg` can silently drop frames it cannot decode (observed with xHE-AAC) and still exit with code `0`, producing a truncated timeline unless codec and decoded duration are verified.

## What breaks if you change this

- Removing `SpotCheck` or lowering the 3/4 threshold allows mismatched audiobooks or drifted timelines to be marked `"synced"` on the shelf.
- Removing `isDecodable` or `wrongLength` lets partially decoded files pass alignment with missing chapters at the end.
- Switching `SpotCheck` to the same model family as `Acoustic` weakens independence against systematic model errors.

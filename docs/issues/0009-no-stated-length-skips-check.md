# A file that states no length skips the whole-decode check

**Where**: `wrongLength` in `packages/aligner/src/Aligner.ts`

The guard against ffmpeg silently dropping audio compares each file's decoded length with the length its container states. A file that states none is taken at its word, so the one failure the check exists for can pass unnoticed.

**To fix**: Fall back to another measure for such a file, such as its packet count from ffprobe, or fail it with a reason.

# A reading copy over 4 GB cannot be written

**Where**: `TooLarge` and the archive writer in `packages/aligner/src/Overlay.ts`

The reading copy's EPUB is written without ZIP64, so the archive and every offset in it must stay under 4 GB, and a longer audiobook fails its copy.

**To fix**: Write ZIP64 when the copy needs it, or stop putting the audio inside the EPUB, since the reading room plays it from the `audio/` folder.

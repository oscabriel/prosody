# Snap sentence clip boundaries to quiet audio without overlapping neighbours

## Decision

After CTC forced alignment places token frames, `clipsOf` (`packages/aligner/src/Boundaries.ts`) shifts each sentence's start backward and its end forward through sound on the 10 ms loudness track until it reaches quiet, bounded by `TUNING` (`lead`, `reachBack`, `reachForward`) and never crossing a neighbour's rough edge. Brief quiet dips up to `bridge` (60 ms) are crossed while extending the end.

If two adjacent settled clips still overlap because speech ran continuously between them, `clipsOf` meets them at the quietest 10 ms step in the overlap so no audio belongs to two sentences.

## Why

CTC models emit tokens as sharp spikes rather than full phoneme durations, so the first and last token frames sit inside the speech rather than at its acoustic edges. Walking outward to quiet captures the full spoken sentence; bridging gaps up to 60 ms prevents stopping early on stop-consonant closures inside words; splitting overlaps at the quietest sample ensures monotonic, non-overlapping clips. The constants in `TUNING` were tuned across five benchmark books.

## What breaks if you change this

- Using raw CTC frame times cuts off the first and last syllables of sentences when seeking or highlighting.
- Removing `bridge` clips sentences prematurely at internal plosives (`p`, `t`, `k`).
- Removing the overlap resolution pass produces overlapping `clipBegin`/`clipEnd` ranges, causing the reading room underline to jump unpredictably and violating clean SMIL sequencing.

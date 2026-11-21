# Anchor text to audio with unique n-gram ties, then run CTC forced alignment per phrase

## Decision

Alignment (`packages/aligner/src/Align.ts`, `packages/aligner/src/Anchors.ts`, `packages/aligner/src/ForcedAlign.ts`) runs in two stages:

1. **Ties and out-of-order regions**: `candidatesOf` matches 5-word n-grams (`GRAM = 5`, apostrophes stripped) that appear once in both the spoken book text and Parakeet's greedy transcript. `longestChain` keeps the longest monotonic sequence, `steadyTies` drops isolated coincidences, and `straysOf` recurses on clusters outside the main chain to align reordered chapters or front/back matter where they were spoken.
2. **Phrase-level CTC Viterbi**: Between tie cuts (subdividing once with 3-word ties if a lattice exceeds `MOST_CELLS`), `forceAlign` places phrases with both a **garbage state** (for spoken audio missing from the text) and a **skip transition** (for unread text).

Units are phrases split at quotation marks (`SPEECH_EDGE` in `packages/aligner/src/Spoken.ts`), not whole sentences and not comma-delimited clauses; each sentence's span merges its placed phrases.

## Why

- Running CTC Viterbi across a whole 20-hour book at once is intractable in memory and time; unique n-gram ties break the book into small stretches while `straysOf` still handles reordered front/back matter.
- Putting skip and garbage states inside Viterbi lets the decoder decide directly which phrases were unread instead of relying on post-hoc confidence heuristics.
- Splitting sentences at speech boundaries lets dramatised or lightly edited audiobooks drop tags such as "he said" without losing the quoted dialogue; splitting at every comma was tried and caused short fragments to match stray audio by chance.

## What breaks if you change this

- Removing `steadyTies` lets isolated false-positive n-gram matches cut the alignment lattice in the wrong place and ruin surrounding chapters.
- Removing `straysOf` leaves chapters or front matter narrated in a different order from the EPUB completely unaligned.
- Removing the skip or garbage states forces unread text onto unrelated audio or fails to recover after narrator additions.
- Raising `MOST_CELLS` too high risks out-of-memory errors on long unanchored stretches; splitting phrases at commas reintroduces false alignments on short scraps.

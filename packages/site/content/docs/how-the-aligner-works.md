---
title: How the aligner works
summary: Inside Prosody's aligner: how it listens to an audiobook, anchors and aligns every sentence, trims boundaries and spot-checks the result.
order: 9
---

Prosody includes its own aligner in `packages/aligner`. It runs inside the press container on the CPU, written in TypeScript with ONNX speech models and no Python runtime or GPU. Here is what happens to a pair from start to finish.

## 1. Probe and decode the audio

`ffprobe` checks the audiobook's codec, profile and stated duration. Only AAC-LC (or MP3) audio is accepted; codecs that `ffmpeg` cannot decode whole, such as xHE-AAC, are refused immediately.

`ffmpeg` then decodes the audio as a 16 kHz mono stream, so long audiobooks do not need to sit uncompressed in memory. If the decoded duration disagrees with the stated duration beyond a small tolerance (1 second plus 0.1%), the sync stops with an error.

## 2. Listen with Parakeet CTC

An int8-quantised ONNX model (`onnx-community/parakeet-ctc-0.6b-ONNX`) processes the audio stream in 30-second windows with 2 seconds of context on each side, so speech at window boundaries is not cut off.

Rather than producing a plain transcript, the model emits word-piece log-probabilities every 80 milliseconds (1280 samples at 16 kHz). For each frame, Prosody keeps the top 16 word-piece scores and the blank score, plus an audio loudness track sampled every 10 milliseconds.

Those emissions are saved beside the reading copy (`heard-<bytes>.emissions`). If the same audio file is ever aligned again, Prosody reloads the saved emissions and skips listening completely.

## 3. Mark the EPUB's sentences

The aligner unpacks the EPUB and filters out sections narrators do not read: covers, title pages, copyright pages, tables of contents, indexes, glossaries, bibliographies, colophons and notes.

In every remaining section, sentences are wrapped in numbered markers without altering inline formatting such as emphasis or footnote markers.

## 4. Rewrite text into spoken form

Narrators say "doctor" for "Dr." and "nineteen eighty four" for "1984". Each sentence is normalised into spoken English words (expanding abbreviations, cardinals, ordinals, years, decades, clock times, decimals, currencies and common symbols) and encoded into Parakeet's word-pieces.

## 5. Anchor text to audio

From the best-scoring tokens in the emissions, the aligner builds a rough heard-word sequence and searches for 5-word runs that appear exactly once in the book and exactly once in the audio. The longest monotonic chain of steady matches pins the book's prose to the recording.

If a chapter was recorded out of order relative to the EPUB, stray clusters of matching anchors are extracted recursively and aligned in their own chains.

## 6. Forced alignment with skips

Between consecutive anchors, Viterbi forced alignment finds the highest-scoring path through the Parakeet emissions that matches the text's word-pieces in order. If a stretch is too large for a single lattice (over 60 million cells), it is subdivided first using 3-word anchors.

Two escape transitions handle real-world differences between print and audio:

- **Skip transitions** let the path skip an unread phrase or sentence (such as a table or caption) at a fixed penalty.
- **Garbage states** absorb spoken audio that does not belong to any sentence (such as opening credits or "end of chapter").

Whether a sentence was read aloud is therefore decided directly from the acoustic evidence, not guessed afterwards.

## 7. Refine sentence boundaries

Rough sentence timestamps are shifted 40 milliseconds early and then refined against the 10-millisecond loudness track:

- Each start is pulled backward through speech (up to 0.3 seconds) without crossing the previous sentence's rough end.
- Each end is extended forward through speech (up to 0.45 seconds, bridging silent gaps up to 0.06 seconds) without crossing the next sentence's rough start.
- If two neighbouring clips still overlap after settling, they are split at the quietest point between them.

Unaligned sentences are left with no timestamps at all; nothing is interpolated.

## 8. Spot-check with Whisper

A second model (`onnx-community/whisper-base.en`) checks the first model's work. The aligner selects up to 40 aligned sentences between 3 and 15 seconds long, evenly spaced through the book, decodes each audio clip and transcribes it with Whisper.

Each clip passes if the word likeness between the page text and Whisper's transcript is at least 80%. If fewer than three in four checked sentences pass (or if no sentence was long enough to check), the entire sync is refused.

## 9. Write the reading copy

Finally, the press writes the reading copy to `PROSODY_COPIES`: the marked XHTML sections, a copy of the audio, an EPUB 3 file with SMIL media overlays, `timeline.json`, `contents.json` and the extracted cover image.

## Measured accuracy and speed

Evaluated across five real books (three novels and two technical books, 72 hours of audio in total) on an 8-core CPU-only Linux host:

| Measure | Result |
|---|---|
| Typical start error (median) | 0.08 to 0.12 seconds |
| Typical end error (median) | 0.12 to 0.17 seconds |
| Sentence ends running over 0.5 s long | 0 across all five books |
| Sentences placed in three novels | 97.1% to 99.3% |
| Sentences placed in two technical books | 62.0% and 83.7% |
| Spot checks passed | 37 to 40 of 40 per book |
| Listening speed | 13× to 23× real time (19× overall) |
| Alignment + reading copy + spot check (from saved emissions) | Under 35 seconds per book (1 to 3 s for alignment itself) |

Start and end errors were measured against faster-whisper `small.en` word timestamps on roughly 75 sentences per book; because Whisper's own word timestamps are accurate to about 0.1 seconds, treat the boundary figures as "within roughly a tenth of a second".

The two technical books placed fewer sentences because much of their content (code blocks, tables, captions and reference lists) is not narrated. When a listening check sampled 30 sentences per book that Prosody placed and an earlier aligner had missed, the words were confirmed in 26 and 28 of 30.

## Known limitations

- **Short dialogue tags.** Very short tags such as `"I asked."` after dialogue are occasionally skipped even when spoken (about 30 times in one 13.5-hour novel). Lowering the skip penalty recovers some of them at the cost of placing more unread sentences wrongly.
- **Abridged or different editions.** The EPUB and audiobook must share the same text.
- **Audio codecs.** Codecs other than AAC-LC (or MP3) are refused rather than partially decoded.
- **English only.** Both speech models and the spoken-text normalisation rules are English only.

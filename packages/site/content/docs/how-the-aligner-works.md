---
title: How the aligner works
summary: How Prosody finds where each sentence of a book is spoken in its audiobook, and how it knows when it is wrong.
order: 9
---

The aligner is Prosody's own, in `packages/aligner`. It runs inside the press, on the processor, with no Python and no GPU. This page follows one book through it.

## 1. Read the audio

ffmpeg decodes the audiobook to plain sound, and the aligner reads it as a stream, so a 20-hour book never sits in memory at once.

If ffmpeg cannot decode the whole file, the sync stops here with the reason. A file that decodes to less than its stated length is refused too: that is how a codec ffmpeg half-understands shows itself.

## 2. Listen

A speech model, NVIDIA's Parakeet CTC, hears the audio in 30-second windows that overlap by a few seconds, so nothing is lost at a seam.

It does not write a transcript. For each 80 milliseconds of sound it says how likely each of about a thousand word-pieces is. Those likelihoods are the raw material for everything after, and they are kept beside the reading copy. A second sync of the same audio starts from them and skips the listening.

## 3. Mark the sentences

The EPUB is opened, and the sections a narrator would read are split into sentences. Each sentence is wrapped in a marker of its own without disturbing the book's formatting: emphasis, links and footnote marks stay as they were.

Covers, title pages, contents, indexes and reference lists are left out. They are not counted as text the narrator missed.

## 4. Say it as a narrator would

A narrator does not say "Dr." or "1984". Each sentence is rewritten as it is spoken, "doctor" and "nineteen eighty four", and then broken into the same word-pieces the speech model uses.

## 5. Find the anchors

The aligner first looks for runs of six words that appear exactly once in the text and exactly once in what was heard. The longest chain of those, in the same order in both, pins the book to the recording.

Between two anchors there are three cases:

- **Text and audio both.** This stretch goes on to the next step.
- **Text with almost no audio.** The narrator did not read it. Its sentences are left unplaced.
- **Audio with no text.** Credits, "end of chapter one", a publisher's introduction. It stays in the audio, attached to no sentence.

Chapters recorded out of order become chains of their own, and still line up.

## 6. Place each sentence

Within each stretch, the aligner finds the best path through the model's likelihoods that says the text's word-pieces in order. This is forced alignment, and it is exact where a transcript is approximate: it does not ask what was said, only when.

Prosody's version allows two escapes. The path may skip a whole sentence, at a cost, and it may pass through a state that soaks up sound belonging to no sentence. So whether a caption or a code listing was read is decided here, by the audio, and not guessed afterwards.

## 7. Trim the edges

A sentence starts at the first frame of its first word-piece. It ends at the last frame of its last, stretched only through the quiet that follows, and never past the start of the next sentence.

Nothing is interpolated. A sentence the path skipped has no time at all, and is not highlighted.

## 8. Check the work

A model cannot be trusted to mark its own homework, so a different one does it. Whisper listens to forty of the placed sentences, spread through the book, and the words it hears are compared with the words on the page.

If fewer than three in four are right, the whole sync is refused.

## 9. Write the reading copy

The marked text, the audio, the cover and a timeline of every sentence's start and end are written to the reading copy. The reading room needs nothing else to follow the narrator.

## How well it does

Measured on five books, 72 hours of audio, on an eight-core x86-64 machine with no GPU:

| Measure | Result |
|---|---|
| Where a sentence starts, typical error | 0.08 to 0.12 seconds |
| Where a sentence ends, typical error | 0.12 to 0.17 seconds |
| Ends running more than half a second long | none, in any book |
| Sentences placed, in three novels | 97.1% to 99.3% |
| Sentences placed, in two technical books | 62.0% and 83.7% |
| Speed of listening | 13 to 23 times faster than the book plays |
| Speed of everything after listening | under a minute a book |

The starts and ends were judged against a third model's word timings, on about 75 sentences a book. That method cannot tell errors smaller than a tenth of a second apart, so read the first two rows as "about a tenth of a second".

The technical books place fewer sentences because more of them is never read aloud: code, tables, captions and references. Among the hardest sentences in those two books, ones an earlier aligner had left out, a listening check found the right words in 26 and 28 of 30 sampled.

## What it does not do well

- **Short dialogue tags.** "I asked." after a line of speech is sometimes left unplaced, though it was read. About thirty in one long novel.
- **Abridged or re-translated recordings.** The text and the audio must be the same words.
- **Codecs beyond AAC-LC.** They are refused, not guessed at.
- **Languages other than English.** The speech models and the rewriting of numbers are English only.

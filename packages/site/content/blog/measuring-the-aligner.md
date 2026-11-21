---
title: Measuring the aligner
summary: Five books, 72 hours of audio, and what a third speech model heard at the edge of every sentence.
date: 2026-11-19
---

**In short:** Prosody's aligner puts the start of a sentence within about a tenth of a second of where it is spoken, never lets an end run on by more than half a second, and listens about 19 times faster than the book plays on eight cores with no GPU. This post says how those numbers were found, and where they are weak.

[How the aligner works](/docs/how-the-aligner-works) explains the steps. This is about checking them.

## What was measured

Five books from one library: three novels and two technical books, 72 hours of audio in all. Everything ran on one eight-core x86-64 machine with no GPU.

For a baseline, the same books were run through the aligner Prosody used before it had its own: Storyteller's `@storyteller-platform/align`, version 0.2.16, with the options that drop unread text and cap the gap between sentences, so that both were measured on the same terms.

## How

**Starts and ends.** For each book, 80 sentences that both aligners had placed, spread through the book. A third model, Whisper small with word timings, transcribed the sound around each. An aligner's start is scored against the time of Whisper's first word, and its end against the last.

Whisper is not a ruler. Where it called a start late, the loudness of the audio itself was checked. Of 36 such starts, 34 had a quarter second of quiet before Prosody's mark: Whisper had put the word inside the silence. So the worst figures below overstate the error.

**Read or not read.** An aligner must also decide what the narrator skipped. For sentences only one of the two placed, Whisper listened to that clip and said whether the sentence's words were in it. Thirty were sampled a side, a book.

**Speed.** Wall-clock time for listening, and for everything after.

## The numbers

Each cell is Prosody, then the baseline. Errors are the median and the 90th percentile, in seconds.

| Book | Audio | Start error | End error | Ends over 0.5 s long |
|---|---|---|---|---|
| A novel | 13.5 h | 0.09, 0.24 / 0.52, 0.66 | 0.12, 0.23 / 0.16, 0.44 | 0 / 2 |
| A technical book | 9.9 h | 0.08, 0.39 / 0.52, 0.76 | 0.17, 0.27 / 0.12, 0.52 | 0 / 7 |
| A novel | 16.2 h | 0.12, 0.27 / 0.54, 0.68 | 0.14, 0.24 / 0.16, 0.46 | 0 / 1 |
| A novel | 11.5 h | 0.10, 0.32 / 0.52, 0.66 | 0.15, 0.27 / 0.18, 0.40 | 0 / 1 |
| A technical book | 20.9 h | 0.08, 0.50 / 0.52, 1.10 | 0.13, 0.24 / 0.14, 0.58 | 0 / 10 |

And for what was read:

| Book | Sentences placed | Placed by one alone, and Whisper heard the words |
|---|---|---|
| A novel, 13.5 h | 98.0% / 97.4% | 29 of 30 / 12 of 30 |
| A technical book, 9.9 h | 62.0% / 57.7% | 28 of 30 / 15 of 30 |
| A novel, 16.2 h | 99.3% / 97.7% | 29 of 30 / 2 of 18 |
| A novel, 11.5 h | 97.1% / 96.6% | 27 of 30 / 11 of 30 |
| A technical book, 20.9 h | 83.7% / 67.6% | 26 of 30 / 11 of 30 |

## What they show

**Starts are about five times closer.** The baseline begins each sentence about half a second before its first word. Prosody aims for the word itself, because a tap on a sentence should begin with its first word and not the tail of the one before.

**Ends do not run on.** No end, in any book, ran more than half a second past the last word. An end that runs on is what makes a highlight lag behind a fast reader.

**Deciding what was read matters most in technical books.** When only Prosody placed a sentence, the words were there 26 to 29 times in 30. That is the gain from letting the alignment itself decide, by the sound, whether a sentence was read.

**The baseline is much faster at listening.** It runs a smaller speech model, 100 to 200 times faster than the book plays against Prosody's 13 to 23. Prosody spends that time on a model that hears narrators better, and gets it back on every later sync: what was heard is kept, and aligning from it takes one to three seconds.

## Where the numbers are weak

- **The ruler is coarse.** Whisper's word times are good to about a tenth of a second. These results cannot tell 0.05 from 0.1. A set of sentences marked by hand would, and does not exist yet.
- **Five books, one machine, all English.** One narrator appears twice.
- **Short dialogue tags.** In one novel about thirty tags such as "I asked." were read aloud and left unplaced. Making sentences cheaper to keep recovers some, and puts six times as many on the wrong audio, so it stays as it is.
- **The baseline has moved on.** Storyteller is under active development, and this is one version of its aligner on one day.

## Try it

The opening of Moby-Dick on the [front page](/) was synced by the same code, from a public-domain text and recording. Press Listen, and judge the starts and ends by ear.

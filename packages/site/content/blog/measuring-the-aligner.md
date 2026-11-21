---
title: Measuring the aligner
summary: Benchmarks of Prosody's aligner against Storyteller's across five books and 72 hours of audio on an 8-core CPU.
date: 2026-11-19
---

Prosody originally used Storyteller's aligner before I built a dedicated one in `packages/aligner`. Across five books and 72 hours of audio on an 8-core CPU with no GPU, Prosody's aligner lands sentence starts within about 0.1 s (median), produces zero sentence ends running more than 0.5 s past the last word, and listens at 19× real time overall.

[How the aligner works](/docs/how-the-aligner-works) explains the pipeline. This post reports how I measured it, where it improves on Storyteller's aligner, where Storyteller's is better, and where the measurements themselves are limited.

## Test setup

I ran both aligners on five English books from one library: three novels and two technical books, totalling 72 hours of audio. Everything ran CPU-only on one 8-core x86-64 machine.

The baseline was Storyteller's `@storyteller-platform/align` version `0.2.16`, run with `--drop-unread --gap-seconds 0.5` so both aligners dropped unread text and capped trailing gaps on the same terms. It reused its QuartzNet emissions from an earlier run.

I measured three things:

- **Sentence boundaries.** For each book, 80 sentences placed by both aligners with identical text, spread through the book (71 to 79 judged sentences per book). A third model, `faster-whisper` `small.en` with word timings, transcribed the audio around each clip. Each aligner's start time was scored against Whisper's first word, and its end time against Whisper's last word.
- **Read vs unread text.** For sentences placed by only one aligner, Whisper listened to that aligner's clip and checked whether the sentence's words were actually spoken there. Up to 30 sentences were sampled per side per book.
- **Wall-clock speed.** Time spent running the acoustic model (listening), and time spent aligning from saved emissions.

## Boundary accuracy

Each cell shows Prosody first, then `@storyteller-platform/align` 0.2.16. Start and end errors are median and 90th percentile, in seconds.

| Book | Audio | Start error (s) | End error (s) | Ends > 0.5 s long |
|---|---|---|---|---|
| Novel | 13.5 h | 0.09, 0.24 / 0.52, 0.66 | 0.12, 0.23 / 0.16, 0.44 | 0 / 2 |
| Technical book | 9.9 h | 0.08, 0.39 / 0.52, 0.76 | 0.17, 0.27 / 0.12, 0.52 | 0 / 7 |
| Novel | 16.2 h | 0.12, 0.27 / 0.54, 0.68 | 0.14, 0.24 / 0.16, 0.46 | 0 / 1 |
| Novel | 11.5 h | 0.10, 0.32 / 0.52, 0.66 | 0.15, 0.27 / 0.18, 0.40 | 0 / 1 |
| Technical book | 20.9 h | 0.08, 0.50 / 0.52, 1.10 | 0.13, 0.24 / 0.14, 0.58 | 0 / 10 |

## Read vs unread sentences

Each aligner counts its own sentences. Prosody skips unread front and back matter (covers, title and copyright pages, tables of contents, indexes, glossaries and in-chapter reference lists) before counting, so its percentage is the share of prose sentences placed.

The third column shows how many uniquely placed clips contained the sentence's words according to Whisper, with the total number of uniquely placed sentences in brackets.

| Book | Placed | Only one placed (Whisper heard) | Spot check |
|---|---|---|---|
| Novel, 13.5 h | 98.0% / 97.4% | 29 of 30 (153) / 12 of 30 (80) | 39 of 40 |
| Technical book, 9.9 h | 62.0% / 57.7% | 28 of 30 (414) / 15 of 30 (315) | 38 of 40 |
| Novel, 16.2 h | 99.3% / 97.7% | 29 of 30 (263) / 2 of 18 (18) | 40 of 40 |
| Novel, 11.5 h | 97.1% / 96.6% | 27 of 30 (136) / 11 of 30 (82) | 39 of 40 |
| Technical book, 20.9 h | 83.7% / 67.6% | 26 of 30 (974) / 11 of 30 (114) | 37 of 40 |

In earlier runs on the same books, Storyteller's aligner also passed 37 to 40 of 40 on the same spot check.

## Speed

| Book | Audio | Prosody listening | Prosody rate |
|---|---|---|---|
| Novel | 13.5 h | 62 min | 13× |
| Technical book | 9.9 h | 33 min | 18× |
| Novel | 16.2 h | 48 min | 20× |
| Novel | 11.5 h | 32 min | 22× |
| Technical book | 20.9 h | 56 min | 23× |

Across all 72 hours, Prosody's Parakeet CTC 0.6B model ran at 19× real time (13× to 23× per book). Storyteller's smaller QuartzNet model is much faster at listening: 100× to 200× real time on the same machine.

After listening, Prosody saves the emissions beside the reading copy so re-aligning never listens twice. Aligning from saved emissions takes 1 to 3 seconds per book (under 35 seconds total including writing the reading copy and running the 40-clip Whisper spot check), compared with 106 to 296 seconds for Storyteller's aligner.

## What the numbers show

**Where Prosody's aligner is better:**

- **Start precision.** Median start error is 0.08 to 0.12 s versus 0.52 to 0.54 s for the baseline, which starts each clip roughly half a second early. Tighter starts mean tapping a sentence plays its first word rather than the tail of the previous sentence.
- **No runaway ends.** Zero clips ran more than 0.5 s past the last word across all five books, versus 1 to 10 per book for the baseline. Prosody's ends sit 0.11 to 0.16 s after Whisper's, landing in the quiet after the last word.
- **Read vs unread decisions.** On sentences only Prosody placed, Whisper heard the words in 26 to 29 of 30 clips. On sentences only Storyteller placed, Whisper heard them in 2 of 18 to 15 of 30. The gap is largest in technical books, where diagrams, code listings and sidebars are often skipped by narrators.
- **Re-alignment speed.** Re-running alignment from saved emissions takes 1 to 3 seconds rather than two to five minutes.

**Where Storyteller's aligner is better:**

- **Initial listening speed.** QuartzNet runs 5× to 10× faster than Parakeet on CPU (100× to 200× real time vs 13× to 23×). If you align a book once and never re-align it, Storyteller finishes the whole pass sooner.
- **One median end error.** On the 9.9-hour technical book, Storyteller's median end error was lower (0.12 s vs 0.17 s), though its 90th percentile was higher (0.52 s vs 0.27 s).

## Limits of these measurements

- **Whisper is a coarse ruler.** `faster-whisper` word timings are accurate to roughly 0.1 s, so these measurements cannot separate 0.05 s from 0.1 s. Where Whisper flagged one of Prosody's starts as late, I checked the audio loudness directly: in 34 of 36 cases there was 0.25 s of silence before Prosody's mark, meaning Whisper had placed the word inside silence. The 90th-percentile start errors above therefore overstate Prosody's error. A hand-marked test set would give sharper numbers.
- **Small sample.** Five English books on one machine.
- **Short dialogue tags.** In the 13.5-hour novel, about 30 short spoken tags such as `"I asked."` were left unaligned. Raising the penalty for skipping a sentence recovers some of them, but increases wrong placements from about 5 to about 32, so I left the skip cost where it is.
- **One snapshot of Storyteller.** Storyteller is actively developed; these numbers apply to `@storyteller-platform/align` `0.2.16` on one day.

## Judge it by ear

The opening paragraph of *Moby-Dick* on the [front page](/) was aligned with this code from public-domain text and audio. Press Listen and judge the starts and ends directly.

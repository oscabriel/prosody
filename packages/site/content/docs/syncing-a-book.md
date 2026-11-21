---
title: Syncing a book
summary: What happens when Prosody aligns an EPUB with its audiobook, what the spot check verifies, and what each refusal message means.
order: 6
---

When a work has both an `.epub` and an `.m4b` under the same `<Author>/<Title>`, the press aligns them automatically.

## The sync pipeline

1. **Decode and check the audio.** The press probes the `.m4b` with `ffprobe` and decodes it with `ffmpeg`.
2. **Listen once.** A speech model listens to the entire audiobook on the CPU. For a 21-hour book this takes roughly an hour on a CPU-only host.
3. **Align sentences.** Every sentence in the book's narrated sections is matched to its timestamps in the audio, leaving unread sentences unplaced.
4. **Spot check.** A second speech model (Whisper) listens to up to 40 placed sentences between 3 and 15 seconds long, spread across the book, and compares what it hears against the text. Each clip passes if the words match with at least 80% likeness, and at least three in four checked sentences must pass.
5. **Publish the reading copy.** Once the spot check passes, the press writes the reading copy and the shelf marks the book `synced`.

Books are queued and processed one at a time in the order they arrive. Everything else on the shelf stays open while a book is syncing. Each alignment attempt has a six-hour deadline.

For the technical details of each stage, see [How the aligner works](/docs/how-the-aligner-works).

## What counts as synced

Prosody skips front and back matter that narrators do not read: covers, title pages, copyright pages, tables of contents, indexes, glossaries, bibliographies, colophons and notes sections. They are not marked as missing sentences.

Inside chapters, sentences that the narrator skipped (such as tables, code listings or figure captions) are left unaligned. They still display normally on the page; they simply do not highlight while audio plays.

Expect a novel to place almost all of its sentences (97% to 99% in testing). A technical book places fewer because more of its text is never read aloud.

## When a sync is refused

Prosody refuses an alignment rather than showing a highlight that drifts from the voice. When a sync fails, the shelf marks the book `not synced` and prints the exact reason beneath the author's name. Opening a `not synced` pair shows the same reason in the reading room, with an **Align it again →** button.

| Reason shown on the shelf | What it means |
|---|---|
| `its audio is <format>, which ffmpeg can't decode whole` | The audio uses a codec Prosody does not accept, such as xHE-AAC. Re-encode the file to AAC-LC and replace it. |
| `ffmpeg decoded <n> of its audio's <m> seconds` | The decoded length does not match the file's stated duration. The file is likely truncated or damaged. |
| `ffmpeg stopped decoding its audio (exit code <n>)` | `ffmpeg` exited with an error while decoding the file. |
| `its text could not be read: <reason>` | The EPUB could not be opened or parsed. |
| `no sentence was found in the audio` | None of the EPUB's sentences matched the recording (for example, mismatched books or an image-only EPUB). |
| `no sentence was long enough to check` | No aligned sentence fell within the 3 to 15 second range required for the spot check. |
| `the spot check heard the right words in only <n> of <m> sentences` | Fewer than three in four checked sentences matched. Common causes are an abridged audiobook or a different translation. |
| `the press did not answer within 6 hours` | The alignment timed out before finishing. |

## Re-aligning a book

What the speech model heard is saved in `PROSODY_COPIES` beside each reading copy (`heard-<bytes>.emissions`), so re-aligning an unchanged audio file skips listening and finishes in under a minute.

You can re-align a pair from its reading room while you are online:

- **A synced book:** open **Synced** in the side panel and click **Align it again**. The book closes in that room until the press finishes, then opens again by itself.
- **A `not synced` book, or one whose reading copy predates the reading room format:** the room shows an **Align it again →** button in place of the text.

If a re-alignment fails, the previous reading copy is gone and the book is `not synced` until a later try succeeds.

## Audio format requirements

- **One `.m4b` per book in AAC-LC.** Most DRM-free audiobook stores provide this format.
- **No xHE-AAC.** Files encoded in xHE-AAC are refused rather than partially decoded.
- **Multi-file MP3s must be combined.** Join chapter MP3s into a single AAC-LC `.m4b` before placing the book in `audiobooks/`.

---
title: Syncing a book
summary: What happens between dropping in a pair and reading along with the narrator, and what to do when it goes wrong.
order: 6
---

## What happens

1. The press finds a book with both an EPUB and an audiobook.
2. It listens to the whole audiobook once. This is the slow part: about an hour for a 21-hour book on eight cores.
3. It places every sentence of the text in what it heard, and marks the ones the narrator did not read.
4. A second speech model listens to forty of the placed sentences, spread through the book, to confirm the right words are there. Three in four must pass.
5. It writes the reading copy, and the shelf says the book is synced.

Books are synced one at a time, in the order they were found. You can read or listen to anything else on the shelf meanwhile.

[How the aligner works](/docs/how-the-aligner-works) explains each step.

## What "synced" covers

A sync is of the book's prose. Covers, title pages, contents, indexes, glossaries and reference lists are left out: no narrator reads them, so they are not counted as missing.

Some sentences in the prose are still left unplaced: a caption the narrator skipped, a code listing, a table. Those sentences read normally and are simply not highlighted. The audio carries on underneath them.

Expect a novel to place nearly every sentence. A technical book places fewer, because more of it is never read aloud.

## Doing it again

The reading room has "Align it again" for a synced book. Use it after you replace a file, or after an update that improves the aligner.

What the speech model heard is kept beside the reading copy, so syncing again does not listen again. It takes under a minute, not an hour. While it runs, the book cannot be opened.

## When a sync is refused

Prosody would rather show a book as not synced than highlight the wrong words. A sync is refused when the spot check hears the right words in fewer than three of every four sentences it tries, or when something earlier fails.

The shelf marks the book "not synced". Its reading room says why, and offers "Align it again".

| What it says | What it means |
|---|---|
| "its audio is ..., which ffmpeg can't decode whole" | The audio is in a codec Prosody does not read, such as xHE-AAC. Convert it to AAC-LC and replace the file. |
| "ffmpeg decoded ... of its audio's ... seconds" | The file is cut short or damaged. |
| "its text could not be read" | The EPUB is broken, or is not an EPUB. |
| "no sentence was found in the audio" | The EPUB and the audiobook are different books, or the EPUB is pictures of pages. |
| "the spot check heard the right words in only ... of ... sentences" | The two editions differ too much: an abridged recording, say, or another translation. |

## Which recordings work

- One `.m4b` file a book, in AAC-LC. That is what most shops sell.
- xHE-AAC, which some newer files use, is not supported. Prosody refuses it instead of syncing it wrongly.
- A book in many MP3 files needs joining into one M4B first.

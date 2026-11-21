---
title: Words
summary: Definitions for the terms Prosody uses across the app and documentation.
order: 13
---

Prosody uses a small, consistent vocabulary throughout the app and these docs. The full developer glossary lives in `GLOSSARY.md` in the repository.

## Library and editions

| Word | Meaning |
|---|---|
| Work | One book as Prosody knows it, regardless of how many editions you have. |
| Edition | One file of a work: its text (`.epub`), its audio (`.m4b`) or its pages (`.pdf`). |
| Text | The `.epub` edition of a work, read sentence by sentence. |
| Audio | The `.m4b` audiobook edition of a work. |
| Pages | The `.pdf` edition of a work, displayed one page at a time. |
| Pair | A work that has both text and audio. Only a pair is synced. |
| Edition alone | The single edition used when a work is not a pair: text first, otherwise pages, otherwise audio. |
| Library | Your book folders on the host (`ebooks/` and `audiobooks/`, by author and title). |
| Shelfmark | A work's `<Author>/<Title>` folder path in the library. |
| Shelf | Every catalogued work in your library, as displayed in the app. |

## Syncing and the press

| Word | Meaning |
|---|---|
| Press | The service that touches book files: it walks the library, aligns pairs and builds reading copies. |
| Walk | One pass by the press over the entire library to discover works and editions. |
| Synced | A pair whose narrated sentences have been aligned to its audio and passed the spot check. |
| Spot check | Re-listening to a spread of aligned sentences with a second speech model (Whisper) to confirm the right words are there. |
| Reading copy | The files the press builds for the reading room: marked text, audio, rendered PDF pages, timeline and cover, stored in `PROSODY_COPIES`. |

## Reading and wanting

| Word | Meaning |
|---|---|
| Reading room | The screen where you read or listen to a single work. |
| Place | Where you are in a work: a sentence, an audio timestamp or a page number. One per work across all devices. |
| Nightstand | The works you are currently reading, shown newest first at the top of the shelf. |
| Set aside | Taking a work off the nightstand without finishing it; your place is kept and reopening it puts it back. |
| Kept copy | A reading copy stored whole in a device's browser cache for offline use. |
| Device | One of your own machines, identified by its Tailscale name. |
| Desk | Where you list books you want and follow them to the shelf. |
| Want | A book on your desk list. |

---
title: Adding books
summary: How to organise your library folders so Prosody discovers, pairs and shelves your books.
order: 5
---

Prosody discovers books by walking your library directory. There is no upload form and no import button: place a file in the right folder and it appears on the shelf.

## Folder layout

Point `PROSODY_LIBRARY` at a directory with two top-level folders, `ebooks` and `audiobooks`, each nested two levels deep by author and title:

```
library/
  ebooks/
    Herman Melville/
      Moby-Dick/
        moby-dick.epub
  audiobooks/
    Herman Melville/
      Moby-Dick/
        moby-dick.m4b
```

A book's identity in the library (its shelfmark) is `<Author>/<Title>`. When the exact same `<Author>/<Title>` exists under both `ebooks` and `audiobooks`, Prosody pairs the text and audio and starts syncing them.

The filenames inside each title folder do not matter. If a folder holds more than one file of the same type, Prosody picks the first one alphabetically.

## Supported editions

| Edition | File type | Folder |
|---|---|---|
| Text | `.epub` | `ebooks/<Author>/<Title>/` |
| Audio | `.m4b` (AAC-LC) | `audiobooks/<Author>/<Title>/` |
| Pages | `.pdf` | `ebooks/<Author>/<Title>/` |

- **Single editions work on their own.** An EPUB opens to read, an M4B plays by its chapters, and a PDF opens one page at a time.
- **EPUB beats PDF.** If a title folder under `ebooks/` contains both an `.epub` and a `.pdf` (with no audiobook), Prosody uses the EPUB.
- **Unsupported formats.** MOBI files, comic archives (CBZ/CBR) and loose folders of MP3s are ignored.

## Discovery and syncing

The press walks the entire library when it starts and every five minutes after that. Any new folder appears on the shelf on the next walk:

- A **pair** (EPUB + M4B) starts syncing automatically. On the shelf it shows `syncing` until the press finishes. See [Syncing a book](/docs/syncing-a-book).
- An **edition alone** is copied into a reading copy automatically. On the shelf it shows `copying`, then `to read` (EPUB or PDF) or `to hear` (M4B).

## Your files stay untouched

For books already in your library, Prosody never moves, renames or modifies them. Everything it generates (marked text, rendered PDF pages, covers, timelines and audio copies) is written to `PROSODY_COPIES`, separate from your library.

A library on a network share (such as NFS or SMB) is supported. If the share is temporarily unavailable during a walk, the press logs the unreadable folders and the shelf keeps what it already knows until the next successful walk.

## Mismatched folder names

If the author or title folder is spelled differently under `ebooks/` and `audiobooks/`, Prosody treats them as two separate single-edition books. Rename one folder so both shelfmarks match exactly, and the next walk pairs them.

## The desk

**The desk** (linked from the shelf) lets you keep a list of books you want. Enter a title and author and click **Want it**; Prosody looks up the book's details in public catalogues (Open Library, Audible and Audnexus) and keeps it on the desk until you click **Withdraw**.

The desk can also be configured to fetch books through external services you run yourself. That integration is optional and disabled by default; see `docs/acquiring/README.md` in the repository if you want to enable it.

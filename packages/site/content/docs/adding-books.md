---
title: Adding books
summary: The library is folders by author and title. Put a book in the right folder and it appears on the shelf.
order: 5
---

## The layout

Prosody reads one folder, your library, shaped like this:

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

There is one rule: **a book is its author's folder and its title's folder.** The same two names under `ebooks` and under `audiobooks` make a pair, and a pair is synced.

The files themselves can have any name.

## What each folder may hold

| Edition | File | Where |
|---|---|---|
| Text | one `.epub` | `ebooks/<Author>/<Title>/` |
| Audio | one `.m4b`, in AAC-LC | `audiobooks/<Author>/<Title>/` |
| Printed pages | one `.pdf` | `ebooks/<Author>/<Title>/` |

- A book with only one of these opens too: an EPUB reads, an audiobook plays by its chapters, a PDF opens a page at a time.
- A book with an EPUB and a PDF reads from the EPUB.
- MOBI files and comics are not read.

## When a book appears

The press walks the whole library as it starts, and every five minutes after. A new folder is on the shelf within one walk. There is no button to press and nothing to import.

A new pair starts [syncing](/docs/syncing-a-book) on its own. Until it is done, the shelf says the press is at work on it.

## What Prosody does to your files

Nothing. It never moves, renames or rewrites a book. What it makes, the reading copies, it keeps in a folder of its own, and it can make them again from your files at any time.

A library on a network share is fine. If the share drops out for a while, the shelf keeps what it knew, and the next walk that can read the share catches up.

## Names that differ

If the author or title is spelled differently under `ebooks` and `audiobooks`, Prosody sees two books, each with one edition. Rename one folder to match the other, and the next walk pairs them.

## The desk

The desk is a list of the books you want next. Name a title and its author, and Prosody looks the book up in the public catalogues and keeps it on the list until it is on your shelf.

The desk can also be wired to fetch a book through services you already run. That is optional and off unless you set it up; the repository's `docs/acquiring` covers it.

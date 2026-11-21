---
title: Where books come from
summary: DRM-free sources for ebooks and audiobooks that work with Prosody, and how to prepare matching editions.
order: 12
---

Prosody reads plain, DRM-free files that you own:

- **Ebooks:** `.epub`
- **Audiobooks:** `.m4b` encoded in AAC-LC (one file per book)
- **PDFs:** `.pdf`

Prosody does not strip DRM and cannot open DRM-locked files. Books locked inside a proprietary app generally cannot be exported into your library.

## DRM-free audiobooks

| Source | Notes |
|---|---|
| [Libro.fm](https://libro.fm) | Sells DRM-free audiobooks downloadable as M4B or MP3, with purchases supporting a local bookshop of your choice. |
| [Downpour](https://www.downpour.com) | Sells DRM-free audiobooks as M4B or MP3. |
| [LibriVox](https://librivox.org) | Free public-domain audiobooks read by volunteers. |
| Your own CDs | Rip and combine into a single AAC-LC `.m4b`. |

## DRM-free ebooks

| Source | Notes |
|---|---|
| [Standard Ebooks](https://standardebooks.org) | Free, carefully typeset public-domain EPUBs. |
| [Project Gutenberg](https://www.gutenberg.org) | Free public-domain EPUBs. |
| [Kobo](https://www.kobo.com) | Offers selected titles without DRM (listed on each title's store page). |
| Direct from publishers | Several independent and technical publishers sell DRM-free EPUBs directly. |

## Choosing editions that pair well

For Prosody to sync a book, the EPUB and the audiobook must share the same text: unabridged, and the same translation for translated works. Check edition details before buying a second format.

To try Prosody quickly with a free pair, the opening of *Moby-Dick* on the front page uses a public-domain text paired with Stewart Wills's LibriVox recording.

## Converting MP3 chapters to M4B

Prosody expects one `.m4b` file per audiobook. If you download an audiobook as a folder of MP3 tracks, join them into a single AAC-LC `.m4b` (preserving chapter markers if your tool supports it) using `ffmpeg` or a dedicated audiobook joiner, then place the `.m4b` in `audiobooks/<Author>/<Title>/`.

## Optional fetching from the desk

If you already run external services for fetching books, the desk can optionally be wired to them. That feature is off unless configured; see `docs/acquiring` in the repository for setup details.

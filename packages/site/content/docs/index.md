---
title: What Prosody is
summary: A self-hosted app for your own ebooks, audiobooks and PDFs that syncs audio to text sentence by sentence.
order: 1
---

Prosody turns folders of books you already own into a reading app on your own machine. Open it on a laptop or phone and your shelf, audio player and reading place follow you between devices.

When a book has both an EPUB and an audiobook, Prosody aligns them on your machine. A speech model listens to the recording once and matches each sentence of the text to the moment it is spoken. From then on, the audio follows the page, tapping a sentence moves the narrator there, and reading and listening share a single place.

## What Prosody handles

- **Synced books.** Read and listen together. The sentence being spoken is highlighted and marked in the margin, and the page scrolls to follow it.
- **Single editions.** An EPUB alone opens to read, an audiobook alone plays chapter by chapter, and a PDF opens one page at a time.
- **One place per book.** Your place (a sentence, a timestamp or a page number) is stored on your host and stays in sync across your devices.
- **Phone and offline reading.** Install the web app to your home screen, control playback from the lock screen, keep full books on a device and read without a network.
- **Accounts and single sign-on.** Every reader shares the library while keeping their own places and nightstand. Sign in with OpenID Connect (such as Pocket ID) or built-in local accounts and admin invite links.

## What Prosody is not

- **Not a hosted service.** You run it on your own Linux machine. Your files, audio and reading history stay there.
- **Not a store or DRM tool.** Prosody only reads plain files without DRM. See [where books come from](/docs/where-books-come-from) for places that sell or distribute DRM-free books.

## Getting started

1. Check the requirements in [What you need](/docs/what-you-need).
2. Deploy the stack with [Installing](/docs/installing).
3. Put Caddy in front and configure accounts or OpenID Connect with [Signing in](/docs/signing-in).
4. Point Prosody at your library in [Adding books](/docs/adding-books).

These pages live in `packages/site/content/docs` in the repository. If anything here disagrees with the app, please report it.

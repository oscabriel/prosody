---
title: Introducing Prosody
summary: A self-hosted app that shelves DRM-free ebooks, audiobooks and PDFs, aligns pairs sentence by sentence on your CPU, and keeps one place per book across devices.
date: 2026-11-20
---

I built Prosody to handle ebooks, audiobooks and sentence-level alignment in a single self-hosted app. It is open source under the MIT licence, runs on a CPU with no GPU, and you can test a real aligned passage on the [front page](/).

## Why one app

Self-hosting both ebooks and audiobooks usually means running separate tools: one server for ebooks, another for audiobooks, and a third step to align the two. That splits a single book across multiple libraries, leaves reading progress in whichever app was used last, and turns alignment into a manual job.

Prosody treats each book as one work in one catalogue, whether it has an EPUB, an M4B audiobook, a PDF, or an EPUB and M4B pair.

## What Prosody does

- **Reads your folders as they are.** Point Prosody at a library organised by author and title (`ebooks/<Author>/<Title>/` and `audiobooks/<Author>/<Title>/`). The press walks the library every five minutes and catalogues what it finds without moving, renaming or modifying your files.
- **Aligns pairs automatically.** When a work has both an EPUB and an M4B audiobook, Prosody aligns them sentence by sentence without being asked. On 8 CPU cores, a 21-hour audiobook takes about an hour.
- **Opens single editions too.** A book does not need to be a pair. An EPUB alone opens to read, an M4B alone plays by its embedded chapters, and a PDF opens a page at a time.
- **Syncs text and audio in the reading room.** While audio plays, the current sentence highlights in the text. Tapping any sentence jumps the audio directly to it.
- **Keeps one place per book.** Your place is stored per work (as a sentence, a timestamp or a page) and follows you across devices. If you listen to an audiobook alone and add its ebook later, it opens at the sentence spoken at your saved timestamp.
- **Works from a phone browser.** The web app installs to a home screen, integrates with lock-screen media controls, opens offline, and lets you keep a whole reading copy on the device.

## Design choices

**Self-checking alignment.** After placing every sentence, a second offline speech model (Whisper `base.en`) listens to up to 40 aligned sentences and compares what it hears with the text. If fewer than three quarters pass, the alignment is rejected and the shelf marks the book `not synced` instead of serving a drifted timeline. [How the aligner works](/docs/how-the-aligner-works) explains the pipeline, and [Measuring the aligner](/blog/measuring-the-aligner) has the benchmark numbers.

**Tailscale authentication.** Prosody has no user accounts, login page or passwords. Caddy checks every request against the host's `tailscaled` daemon and admits only untagged Tailscale devices belonging to the host's owner, passing the device name to the app.

**Offline models, local files.** Both speech models are downloaded once into the container image and run locally on your CPU. Your books and audio are never sent to an external service, and reading copies are written into a separate directory from your library.

**One TypeScript codebase.** Everything from the domain model and aligner to the web app lives in one TypeScript repository, structured so you (or a coding agent) can adjust its assumptions for your own hardware.

## Current limits

- **No native app yet.** Offline reading, lock-screen controls and kept copies work in the browser today, though long listening sessions with a phone screen locked are not yet well tested. A native iOS app is next.
- **Single reader.** Every admitted device on your tailnet shares one reading place per book.
- **English only.** Both speech models and the text-normalisation rules (for numbers, dates and abbreviations) are English only.
- **Audio format.** One M4B file per book, encoded in AAC-LC.
- **No built-in backup.** Backing up your library, reading copies and database is left to your host setup.

## Getting started

You need a Linux host with Docker in swarm mode, Tailscale, Caddy and DRM-free book files. See [What you need](/docs/what-you-need) for the full list, [Where books come from](/docs/where-books-come-from) for sources of DRM-free files, and [Installing](/docs/installing) to deploy it.

## Thanks

Prosody owes a lot to [Storyteller](https://storyteller-platform.dev), which proved self-hosted ebook and audiobook alignment works and whose aligner Prosody used before I wrote a dedicated one.

Prosody is built with [Effect](https://effect.website), [Alchemy](https://github.com/alchemy-run/alchemy) and [Foldkit](https://foldkit.dev). The passage on the front page uses Stewart Wills's reading of *Moby-Dick* for [LibriVox](https://librivox.org).

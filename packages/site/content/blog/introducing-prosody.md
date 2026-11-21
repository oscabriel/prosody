---
title: Introducing Prosody
summary: One self-hosted app for the ebooks and audiobooks you own, with the audio synced to the text on your own machine.
date: 2026-11-20
---

**In short:** Prosody is a self-hosted app that shelves your ebooks and audiobooks, syncs each audiobook to its ebook sentence by sentence, and keeps one place per book across your devices. It is open source under the MIT licence, it runs on a machine with no GPU, and there is a live example on the [front page](/).

## Why it exists

Reading and listening to the same book at home has usually taken three programs: an audiobook server, an ebook reader, and a separate tool to line the two up.

Each is good at its job. Together they are a chore. A new book is added three times. Your place lives in whichever program you used last. And the tool that syncs the audio to the text is run by hand, one book at a time, so most books never get synced at all.

Prosody is those three jobs done by one app, with one idea of what a book is.

## What it does

- **It shelves what you have.** Point it at a library of folders by author and title. EPUBs, M4B audiobooks and PDFs appear on the shelf within five minutes. Nothing is imported, moved or renamed.
- **It syncs a pair on its own.** A book with both an EPUB and an audiobook is aligned without being asked. A 21-hour audiobook takes about an hour on eight cores.
- **It reads and listens together.** In the reading room the sentence being read is marked, and a tap on a sentence moves the audio there.
- **It keeps one place per book.** A sentence, a time or a page, whichever the book has, and the same on every device.
- **It works on a phone.** It installs from the browser, plays from the lock screen, opens offline, and keeps a whole book on the device when asked.

## What makes it different

**The aligner checks itself.** After a book is synced, a second speech model listens to forty of its sentences and compares what it hears with the page. A sync that fails is refused: "not synced" is better than a highlight that drifts. [How the aligner works](/docs/how-the-aligner-works) has the steps and the numbers.

**Signing in is your tailnet.** There are no accounts. A request from one of your own Tailscale devices is let in and known by the device's name. Anything else is refused. There is no login page to attack and no password to leak.

**The web app is the app.** Offline reading, lock-screen controls and a kept copy of a whole book all work from the browser today. A native iOS app is next, for the things a browser cannot do.

**It is yours.** Your books stay files in your folders. The speech models run on your own processor. The code is one TypeScript codebase that you can read, change and host, and that is written so a coding agent can remodel it for your hardware.

## What it needs

A Linux machine with Docker, Tailscale, Caddy, and your books without DRM. [What you need](/docs/what-you-need) has the detail, and [where books come from](/docs/where-books-come-from) lists shops and libraries that sell or give books as plain files.

## What it does not do yet

- There is no native app. The web app is good on a phone, and long sessions with the screen locked are not yet well tested.
- It is for one reader. Everyone on your tailnet who is you shares one place per book.
- It reads English. The speech models, and the way numbers are read aloud, are English only.
- Audio is one M4B a book, in AAC-LC.
- There is no built-in backup.

## Thanks

Prosody owes a great deal to [Storyteller](https://storyteller-platform.dev), which showed that syncing your own audiobooks to your own ebooks at home was possible at all, and whose aligner Prosody ran on before it had its own. If Prosody's shape does not suit you, try it.

It is built on [Effect](https://effect.website), [Alchemy](https://github.com/alchemy-run/alchemy) and [Foldkit](https://foldkit.dev), and the voice on the front page is Stewart Wills, reading Moby-Dick for [LibriVox](https://librivox.org).

[Install it](/docs/installing), and say what breaks.

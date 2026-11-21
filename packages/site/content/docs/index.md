---
title: What Prosody is
summary: One self-hosted app for the ebooks and audiobooks you own. It syncs the audio to the text, and keeps one place in every book.
order: 1
---

## The short of it

You have a library: EPUBs, audiobooks, perhaps some PDFs, in folders on a machine of your own. Prosody runs on that machine and turns the folders into a shelf you can read from any of your devices.

Where a book has both an EPUB and an audiobook, Prosody syncs them. A speech model listens to the audiobook once and finds where every sentence of the text is spoken. From then on the two are one book: the audio follows the text as it plays, a tap on a sentence moves the audio there, and your place is the same whether you read or listen.

It does the work of an audiobook server, an ebook reader and an aligner in one app.

## What it does

- **Reads and listens together.** A synced book highlights each sentence as it is read aloud.
- **Keeps one place per book.** Your place follows you between devices, as a sentence, a time or a page.
- **Works in your pocket.** The app installs on a phone, plays from the lock screen, opens with no network, and keeps a whole book on the device when asked.
- **Opens what you have.** An EPUB alone reads, an audiobook alone plays by its chapters, and a PDF opens a page at a time.
- **Signs in with your tailnet.** Only your own Tailscale devices reach it. There are no accounts and no passwords.

## What it is not

- It is not a service. Nobody hosts it for you, and nothing about your reading leaves your machine.
- It is not a shop, and it does not remove DRM. It reads the files you already have: see [where books come from](/docs/where-books-come-from).
- It is not for a household of accounts. Every device on your tailnet that you own is you, with one place per book.

## Where to go next

1. [What you need](/docs/what-you-need): the hardware, and the software beside it.
2. [Installing](/docs/installing): from a clone to a running app.
3. [Signing in](/docs/signing-in): Caddy, Tailscale and a name for the app.
4. [Adding books](/docs/adding-books): how the library is laid out.

If something is unclear or wrong in these pages, that is a bug: the source for them sits beside the code, in `packages/site/content`.

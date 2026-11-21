---
title: What you need
summary: A Linux machine with Docker, Tailscale and Caddy, and your books in folders. No GPU.
order: 2
---

## The host

| Thing | What for |
|---|---|
| A Linux machine with Docker | Prosody runs as Docker swarm services: Postgres, the model, the Api, the press and a relay. One node is enough. |
| Eight processor cores, or about that | Syncing runs on the processor, with a thread for every core. Fewer cores work, and take longer. |
| Disk for the reading copies | A local folder. A synced book takes about twice the size of its audiobook. |
| About 3 GB for the press's image | It holds ffmpeg, poppler and two speech models, downloaded once as the image is built. |

Prosody was built and is run on an x86-64 machine with eight cores and no GPU. Other architectures are untested.

## How long a sync takes

Listening is the slow part, and it happens once per audiobook.

| Audiobook | Time to listen to it |
|---|---|
| 9.9 hours | 33 minutes |
| 11.5 hours | 32 minutes |
| 13.5 hours | 62 minutes |
| 16.2 hours | 48 minutes |
| 20.9 hours | 56 minutes |

These are five real books on an eight-core x86-64 machine with no GPU. The rest of a sync, from what was heard to a book you can open, takes under a minute.

Across 72 hours of audio the speech model ran 19 times faster than the books play, and between 13 and 23 times for any one book. What it heard is kept, so syncing the same book again takes seconds.

## Beside the host

| Thing | What for |
|---|---|
| Tailscale on the host | Signing in asks the host's Tailscale whose device each request came from. |
| Tailscale on each device you read with | Only your own devices are let in. |
| Caddy on the host | It is the one way in, and checks every request before passing it on. |
| A name for the app | Something like `prosody.example.com`, resolving to the host's tailnet address, with a certificate Caddy can serve. |

## To install and update

| Thing | What for |
|---|---|
| Node 26.11 or newer | To check and deploy. |
| pnpm 12 | `corepack enable` gives you the right one. |
| Bun | The deploy tool runs on it. |

## Your books

- **Ebooks** as EPUB, without DRM.
- **Audiobooks** as one M4B file a book, in AAC-LC, without DRM.
- **PDFs** open too, a page at a time.

[Where books come from](/docs/where-books-come-from) lists places that sell or give books in these forms, and [adding books](/docs/adding-books) says how to lay them out.

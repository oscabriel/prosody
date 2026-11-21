---
title: What you need
summary: The host hardware, supporting software, build tools and book formats required to run Prosody.
order: 2
---

Prosody runs on a single Linux machine with no GPU. Alignment runs on the CPU, and the rest of the stack is light enough to share the host with other services.

## The host

| Requirement | Why it is needed |
|---|---|
| Linux with Docker (swarm mode) | Prosody runs Postgres, the model runner, the Api and the press as Docker swarm services, alongside a Caddy relay container. A single-node swarm is enough. |
| Multi-core CPU | The speech model runs on the CPU using one thread per physical core by default. More cores shorten the initial listen; no GPU is used. |
| Local disk for reading copies | The press writes reading copies to a local folder. Each synced book takes roughly twice the size of its audiobook (an audio copy plus an EPUB containing the audio, alongside the saved speech emissions). |
| About 3.2 GB for the press image | The press container image (3.15 GB) bundles ffmpeg, poppler and both speech models, downloaded once during the first build. |

## Syncing speed

Listening to an audiobook is the slow step, and it happens only once per audio file. Measured across five real books (72 hours of audio in total) on an 8-core CPU-only Linux host:

| Audiobook length | Time to listen |
|---|---|
| 9.9 hours | 33 minutes |
| 11.5 hours | 32 minutes |
| 13.5 hours | 62 minutes |
| 16.2 hours | 48 minutes |
| 20.9 hours | 56 minutes |

Across those five books, listening ran 13 to 23 times faster than real time (19 times overall). Once listening finishes, aligning the text, building the reading copy and running the spot check takes under 35 seconds. Because the speech model's output is saved beside the reading copy, re-aligning the same audio skips listening altogether.

## Networking and sign-in

| Requirement | Why it is needed |
|---|---|
| Tailscale on the host | The Api queries the host's Tailscale daemon over `/var/run/tailscale/tailscaled.sock` to identify each device. |
| Tailscale on every reading device | Only your own untagged Tailscale devices are admitted. |
| Caddy on the host | Caddy terminates TLS, checks every request via `forward_auth`, and proxies to the relay on loopback. |
| A domain name for the app | For example `prosody.example.com`, pointing to the host's tailnet address, with a TLS certificate Caddy can serve. |

## Tools for installing and updating

Run these on the host where you deploy:

| Tool | Version / notes |
|---|---|
| Node.js | 26.11.0 or newer |
| pnpm | 12 (`corepack enable` activates the pinned version) |
| Bun | Required by the Alchemy deploy tool |

## Your book files

- **Ebooks:** DRM-free `.epub` files.
- **Audiobooks:** DRM-free `.m4b` files encoded in AAC-LC, one file per book.
- **PDFs:** Plain `.pdf` files, displayed one page at a time.

See [Where books come from](/docs/where-books-come-from) for DRM-free sources, and [Adding books](/docs/adding-books) for the folder layout.

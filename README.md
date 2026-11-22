# Prosody

Prosody is a self-hosted app for ebooks and audiobooks. It pairs an EPUB with its audiobook, aligns them sentence by sentence on your own machine, and keeps one reading place per book across your devices.

## What it does

- **Aligned reading and listening.** When a work has both an EPUB and an M4B audiobook, Prosody aligns them locally using speech models. In the reading room, the audio follows the text and tapping any sentence jumps playback there.
- **Unpaired books.** An EPUB opens to read on its own, an M4B plays by its chapters, and a PDF opens a page at a time.
- **One place per book.** Your place follows you between devices, tracked by sentence, timestamp or page. Books you are currently reading appear on the nightstand.
- **Offline and mobile ready.** The web app installs to a phone's home screen, integrates with lock-screen media controls, opens without a network connection, and can save a kept copy of a full book on the device.
- **A desk for wanted books.** Admins can look up books in public catalogues and track what they want. You can also connect services you already run so the desk fetches, shelves, pairs and aligns books automatically; see [`docs/acquiring/README.md`](docs/acquiring/README.md).
- **Accounts and single sign-on.** Every reader shares the library while keeping their own reading places and nightstand. Sign in with OpenID Connect (such as Pocket ID) or built-in local accounts with admin invite links.

## Requirements

- A Linux host with Docker in swarm mode. Alignment runs on the host's CPU (benchmarked on 8 CPU cores; no GPU required).
- Caddy (or another reverse proxy) on the host, with a TLS certificate for the domain you give Prosody.
- An optional OpenID Connect provider if you prefer single sign-on over built-in local accounts.
- A library directory split into `ebooks/<Author>/<Title>/` (`.epub`, `.pdf`) and `audiobooks/<Author>/<Title>/` (`.m4b`).
- Node 26.11 or newer, pnpm 12 and Bun to run checks and deploy.

## Getting started

Read [`docs/hosting.md`](docs/hosting.md) for the full setup guide: preparing directories, configuring `.env`, adding the Caddy reverse-proxy block, running the first deploy, and adapting the source if your host differs.

The short version:

```sh
pnpm install
cp .env.example .env
# Edit .env for your host
pnpm check
pnpm run deploy --yes
```

Use `pnpm run deploy` rather than `pnpm deploy` (which is a different built-in pnpm command). If you are setting up with a coding agent, point it at [`AGENTS.md`](AGENTS.md) and [`docs/hosting.md`](docs/hosting.md).

## Repository layout

| Package | Role |
|---|---|
| `packages/domain` | The model: aggregates, commands, policies, views and API contracts, with no I/O. |
| `packages/server` | The Api, sign-in (`Session`, `AuthRoutes`, `OidcClient`, `AuthStore`), and adapters for external services. |
| `packages/press` | The only service that touches book files: walks the library, builds reading copies and shelves fetched books. |
| `packages/aligner` | Local forced alignment: Parakeet CTC maps each sentence to the audio, and Whisper spot-checks the result. |
| `packages/web` | The reader web app (Foldkit) and its service worker for offline use and kept copies. |
| `packages/site` | The public landing page, docs and blog (Foldkit), built to static pages for Cloudflare. |

Everything is written in TypeScript on [Effect](https://effect.website). The model runs on [Alchemy](https://github.com/alchemy-run/alchemy)'s domain framework and Effect Cluster with Postgres, deployed as Docker swarm services from [`alchemy.run.ts`](alchemy.run.ts).

More documentation in this repository:

- [`GLOSSARY.md`](GLOSSARY.md): the exact terms used in the model and UI.
- [`docs/how-it-works.md`](docs/how-it-works.md): how each subsystem works and what breaks when it changes.
- [`docs/adr/`](docs/adr): architecture decision records.
- [`docs/issues/`](docs/issues): known workarounds still to fix.

Source files carry no comments. Run `pnpm check` to verify formatting, linting, typechecking and tests before committing.

## Licence

MIT; see [`LICENSE`](LICENSE). Third-party components keep their own licences beside them: the lint rules in [`tools/oxlint/anti-slop`](tools/oxlint/anti-slop/LICENSE) and the EB Garamond fonts in [`packages/web/src/fonts`](packages/web/src/fonts/OFL.txt).

# Prosody

One self-hosted app for ebooks and audiobooks: shelve your books, sync the audio to the text, and read or listen with one place per book.

It does the work of an audiobook server, an ebook reader and an aligner in one.

## What it does

- **Reads and listens together.** A book with both an EPUB and an audiobook is aligned sentence by sentence, on your own machine, by a speech model. In the reading room the audio follows the text, and a tap on a sentence moves the audio there.
- **Keeps one place per book.** Your place follows you between devices, as a sentence, a time or a page.
- **Works in your pocket.** The app installs on a phone, plays from the lock screen, opens with no network, and keeps a whole book on the device when asked.
- **Opens what you have.** An EPUB alone reads, an audiobook alone plays by its chapters, and a PDF opens a page at a time.
- **Keeps a list of what you want.** At the desk you name a book, and Prosody looks it up in the public catalogues. It can also fetch the book through services you already run, then shelve, pair and align it on its own; [`docs/acquiring`](docs/acquiring/README.md) covers that.
- **Signs in with your tailnet.** Only your own Tailscale devices reach it. There are no accounts and no passwords.

## What it needs

- A Linux host with Docker in swarm mode. It was built on an x86-64 machine with 8 cores; aligning an audiobook takes a small fraction of its length.
- Tailscale on the host and on every device that reads.
- Caddy on the host, with a certificate for the name you give the app.
- A library of books in folders by author and title.
- Node 26.11 or newer, pnpm 12 and Bun, to check and deploy.

## Hosting it

[`docs/hosting.md`](docs/hosting.md) is the whole guide: what to prepare, the settings, the Caddy block, the first deploy, and where each assumption lives in the source for when your hardware differs.

In short:

```sh
pnpm install
cp .env.example .env      # then fill it in
pnpm check
pnpm run deploy --yes
```

If you work with a coding agent, point it at `AGENTS.md` and `docs/hosting.md` and tell it about your machine.

## How it is built

| Package | What it is |
|---|---|
| `packages/domain` | The model: aggregates, commands, policies and views, with no I/O. |
| `packages/server` | The Api, sign-in, and the adapters for the services the model asks. |
| `packages/press` | The one service that touches book files: it walks the library, makes reading copies and shelves new books. |
| `packages/aligner` | The aligner: Parakeet CTC finds each sentence in the audio, Whisper spot-checks the result. |
| `packages/web` | The app, in Foldkit, with its service worker. |
| `packages/site` | The landing page, docs and blog, in Foldkit, built to static pages. |

The model runs on [Alchemy](https://github.com/alchemy-run/alchemy)'s domain framework and Effect Cluster, with Postgres, as Docker swarm services declared in `alchemy.run.ts`. Everything is written in TypeScript on [Effect](https://effect.website).

[`GLOSSARY.md`](GLOSSARY.md) defines the project's words, [`docs/adr/`](docs/adr) records each decision behind the code, [`docs/issues/`](docs/issues) lists the hacks still to fix, and [`docs/how-it-works.md`](docs/how-it-works.md) says what else to know about each part. The code itself carries no comments.

`pnpm check` formats, lints, typechecks and tests. It must pass before a commit.

## Licence

MIT, in [`LICENSE`](LICENSE). The copy of anti-slop's lint rules in `tools/oxlint/anti-slop` and the EB Garamond fonts in `packages/web/src/fonts` keep their own licences, beside them.

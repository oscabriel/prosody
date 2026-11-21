# Prosody

One self-hosted app for the whole route a book travels: wanting it, fetching it, shelving it, syncing its audiobook to its ebook, and reading or listening. the indexer and the download client stay outside it. `README.md` says what it does. The next work is a native iOS app.

## Any host

The repository is public and names no real machine. Everything about one host is a setting, or in a file git ignores.

- A host's facts are settings in `.env`, read by `packages/server/src/Host.ts`; `.env.example` lists them all. A new fact about the host becomes a setting there, never a constant in the source.
- `docs/hosting.md` is the guide for putting Prosody on other hardware. Its "Where each assumption lives" table names the file to change for everything that is not a setting. Keep both in step with the source.
- Committed files write the host as "the host", its domain as `example.com`, and the source as "your source". Machine names, addresses, user names, home folders and other services on the machine stay out of files, comments, tests and commit messages.
- If `CLAUDE.local.md` exists at the root, read it: it holds this checkout's own machine, names and working notes, and git does not track it.
- Commit only when the user asks.

## Words

`GLOSSARY.md` defines the project's words: a work and its editions, a pair, a shelfmark, a reading copy, a place, a want, a grab, a payload, the press. Use each as it is defined there, in code, comments, tests, the app's text and commit messages, and add a word there when the model gains one.

## Comments

Code carries no comments, of any kind: a doc comment, a note, a `TODO` and a directive to a tool are all refused. A decision is an ADR in `docs/adr/`, a hack is an issue in `docs/issues/`, and a word is in `GLOSSARY.md`; write each there as you make it. `pnpm check` fails on a comment: the lint rule `prosody/no-comments` (`tools/oxlint/prosody`) reports each one in TypeScript, and `pnpm comments` catches one hidden behind a disable directive, or in CSS, HTML, a Dockerfile or YAML. So an error is fixed in the code or the config, never silenced in place. `/delete-comment` sorts and clears comments in bulk.

## How each part works

`docs/how-it-works.md` holds what the source does not say about each part: why it is built as it is, and what breaks when it changes. Read the section for the part you are about to change:

- "Deploying": a deploy, a service's settings or image, Alchemy, the cluster.
- "Signing in": Caddy, the relay, Tailscale, the `Session`.
- "The model": a policy or a view in `packages/domain`.
- "The press": the walk, reading copies, its queue, covers, the aligner.
- "The reading room": places, the nightstand, the lock screen, pages.
- "Offline": the service worker, a place kept offline, a kept copy.
- "The desk": wanting, searching, cataloguing.
- "Grabs and shelving": downloads, sharing, payloads, shelving.
- "Known limits": the bugs, and what is untested.

`docs/adr/` records why the code is as it is, one decision to a file, and `docs/issues/` the hacks still to fix. Read the titles in both before changing a part, and the ADRs that touch it.

## Rules

- `pnpm check` must pass before a commit. `pnpm run deploy` deploys; `pnpm deploy` is a different, built-in pnpm command.
- Deploy with `pnpm run deploy --yes`, and never delete `.alchemy/` while the stack is up: it is Alchemy's record of what is deployed.
- `packages/domain` imports only `effect` and `@alchemy.run/domain`. The linter enforces it.
- Book files are read-only everywhere but to the press, which only ever adds a copied file to the library. Tests and experiments copy what they need and work on the copy.
- A download payload in the downloads is never moved or deleted: a source may require it to keep sharing. `ReleasePayload` takes a payload out of the download client's list only, and only once it has shared what `OBLIGATION` asks.
- A library on a network share can drop out. Check the mount answers (`timeout 8 ls <path>`) before a run that needs it, and treat a failure as an outage to report, not to repair.
- Test against a stand-in the indexer and the download client, or a stage of its own (`ALCHEMY_STAGE`). Wanting a book on the live stack searches the real indexers, and grabbing one downloads it.

## Before using an API

- Alchemy's domain framework (`@alchemy.run/domain`) and its Effect Cluster host are weeks old. Read the installed `node_modules` source, and Alchemy's own docs for its domain, cluster and docker packages, before writing against them.
- Read `node_modules/effect/AGENTS.md` before writing Effect code. Effect 4 differs from what you remember.
- Alchemy stays on the newest release.

## The checks

`pnpm check` is the gate: format, type-aware lint, typecheck, tests. Warnings fail it. `pnpm fix` applies the safe lint fixes and formats.

- One TypeScript everywhere: `typescript` and `tsrs` are both 7.1 beta, and Oxlint runs its type-aware rules on tsrs, Oxc's Rust port of the checker, which it picks over `oxlint-tsgolint` when both are installed. `prepare` patches both with Effect's rules (`effect-tsgo patch --oxlint --tsrs`), so plain `oxlint` in the scripts, the editor and the agents' hook all lint the same way. Move `typescript`, `tsrs` and `@effect/tsgo` together, to versions `@effect/tsgo`'s README lists as supported; an unpatched tsrs fails with `unknown rule: effecttsgo/...`.
- The lint has three layers: Ultracite's presets, Effect's own rules (`@effect/tsgo`, patched in by `prepare`), and anti-slop, copied into `tools/oxlint/anti-slop` (its `UPSTREAM.md` names the commit). The anti-slop copy is ours: change a rule there rather than turning it off file by file.
- Effect's `recommended` preset, plus eleven of its rules beyond it, named in `oxlint.config.ts`: inside an Effect, use Effect's `Config`, `Clock`, `Schema`, `HttpClient`, `Console` and `Random` rather than the globals, and say what an error becomes, how much runs at once (`concurrency`) and where layers are provided. `strict-effect-provide` is off only in the entry points listed there. The rest of Effect's rules are style, for library authors, or for the browser, and stay off.
- Where Effect's style and Ultracite's disagree, Effect's wins: barrel imports (`import { Schema } from "effect"`), `Array<A>`, PascalCase module files. Each exception is named in `oxlint.config.ts`.
- Before using an Effect module that Effect marks unstable, add it to `allowedUnstableApis` in `tsconfig.base.json`.
- Not turned on: anti-slop's code-smell rules (they warn) and its model-judged and diff rules (they send source to a paid model on every run).
- Shape Effect services as anti-slop's policy does, the one its Effect rules encode. Where it disagrees with `node_modules/effect/AGENTS.md`, Effect's wins.
- `.claude/settings.json` runs `oxlint --fix` and `oxfmt` on every file an agent edits.

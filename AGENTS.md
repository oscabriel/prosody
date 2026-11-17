# Prosody

One self-hosted app for the whole route a book travels: wanting it, fetching it, shelving it, syncing its audiobook to its ebook, and reading or listening. It does the work of a book grabber, an audiobook server, an ebook reader and an aligner in one. the indexer and the download client stay outside it.

## State

The foundation is built: the workspace and its checks, the library half of the model, the stack on the swarm, a shelf page, and a press that walks the library. `pnpm check` must pass before a commit. The next work is pairing and alignment, then the reading room.

- `pnpm check` formats, lints, typechecks and tests. `pnpm run deploy` deploys; `pnpm deploy` is a different, built-in pnpm command.
- `packages/domain` imports only `effect` and `@alchemy.run/domain`. The linter enforces it.
- The shelf page runs from its dev server (`pnpm --filter @prosody/web dev`) at `https://prosody.example.com`. Nothing serves a built copy yet.
- `.alchemy/` is Alchemy's record of what is deployed. Never delete it while the stack is up.

## Before using an API

- Alchemy's domain framework (`@alchemy.run/domain`) and its Effect Cluster host are weeks old. Read the installed `node_modules` source, and Alchemy's own docs, before writing against them. The code in the plan is a sketch that was never run.
- Read `node_modules/effect/AGENTS.md` before writing Effect code. Effect 4 differs from what you remember.
- Alchemy stays on the newest release.

## The checks

`pnpm check` is the gate: format, type-aware lint, typecheck, tests. Warnings fail it. `pnpm fix` applies the safe lint fixes and formats.

- The lint has three layers: Ultracite's presets, Effect's own rules (`@effect/tsgo`, patched in by `prepare`), and anti-slop, copied into `tools/oxlint/anti-slop` (its `UPSTREAM.md` names the commit). The anti-slop copy is ours: change a rule there rather than turning it off file by file.
- Where Effect's style and Ultracite's disagree, Effect's wins: barrel imports (`import { Schema } from "effect"`), `Array<A>`, PascalCase module files. Each exception is named in `oxlint.config.ts`.
- Before using an Effect module that Effect marks unstable, add it to `allowedUnstableApis` in `tsconfig.base.json`.
- Not turned on: anti-slop's code-smell rules (they warn) and its model-judged and diff rules (they send source to a paid model on every run).
- For how to shape Effect services, use the `effect-program-design` skill. It is anti-slop's policy, the one its Effect rules encode, installed globally and adapted to Effect 4.1.4 (its `LOCAL-CHANGES.md` lists how). Where it still disagrees with `node_modules/effect/AGENTS.md`, Effect's wins.
- `.claude/settings.json` runs `oxlint --fix` and `oxfmt` on every file an agent edits.

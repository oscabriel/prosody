# Prosody

One self-hosted app for the whole route a book travels: wanting it, fetching it, shelving it, syncing its audiobook to its ebook, and reading or listening. It does the work of a book grabber, an audiobook server, an ebook reader and an aligner in one. the indexer and the download client stay outside it.

## State

Pairing and alignment are built: each book with both editions is paired, aligned by the press, spot-checked by ear, and kept as a reading copy in the copies folder. `pnpm check` must pass before a commit. The next work is the reading room.

- `pnpm check` formats, lints, typechecks and tests. `pnpm run deploy` deploys; `pnpm deploy` is a different, built-in pnpm command.
- `packages/domain` imports only `effect` and `@alchemy.run/domain`. The linter enforces it.
- The shelf page runs from its dev server (`pnpm --filter @prosody/web dev`) at `https://prosody.example.com`. Nothing serves a built copy yet.
- `.alchemy/` is Alchemy's record of what is deployed. Never delete it while the stack is up.
- The press runs in its own base image, `packages/press/image/Dockerfile`, as uid 1000. Bump `PressImage`'s tag in `Press.ts` whenever the Dockerfile changes, or the press keeps the old image.
- Alchemy runs a service's setup on the host when it plans a deploy. Anything that touches the container's own files or mounts goes inside `host.run`.
- Alchemy 2.0.0-beta.87 misses a change to a service's code alone when the service's settings depend on other resources. The Api and the press carry `PROSODY_SOURCE`, a fingerprint of the source (`packages/server/src/Source.ts`), so code changes deploy; give any new service the same.
- Policies act only on new events, never on history. A rule that must also cover what is already recorded needs another trigger: the press reports pairs on every walk for this reason.
- Bump a view's `version` whenever what it computes changes, so it is rebuilt from the history.
- `.pending` in the copies folder is the press's queue. A request stays there until its answer is sent.

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

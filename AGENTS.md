# Prosody

Prosody is a self-hosted app for the full lifecycle of a book: wanting it, shelving it, aligning its audiobook to its ebook, and reading or listening. See `README.md` for what it does. The next planned work is a native iOS app.

If `CLAUDE.local.md` exists at the repository root, read it first. It is untracked and holds local machine names, paths and working notes for this checkout.

## Non-negotiable rules

- **Commit only on request.** Never commit unless the user asks.
- **Pass the gate first.** `pnpm check` must pass before any commit.
- **Keep the repository host-neutral.** This is a public repository and names no real machine. Write the server as "the host" and its domain as `example.com`. Keep machine names, IP addresses, user names, home directories and other host services out of committed files, tests and commit messages.
- **Put host facts in `.env`.** Every host-specific fact is a setting in `.env`, read by `packages/server/src/Host.ts` and documented in `.env.example`. Never hardcode a host fact in source code. Keep `docs/hosting.md` and its "Where each assumption lives" table in step with the source.
- **Keep acquisition details inside `docs/acquiring/`.** What the desk fetches books through is named only in `docs/acquiring/`, code and settings. This file, `README.md`, `GLOSSARY.md`, `docs/hosting.md`, `docs/how-it-works.md` and `packages/site` say only that the desk can fetch a book, and point to `docs/acquiring/`.
- **Treat book files as read-only.** Only the press writes to the library, and it only ever adds copied files. Tests and experiments must copy what they need and work on the copy.
- **Never move or delete downloads.** Leave every file in the downloads folder untouched; `docs/acquiring/` explains why.
- **Expect network shares to drop.** Before running anything that reads a library on a network share, check that the mount answers (`timeout 8 ls <path>`). Treat a failure as an outage to report, not something to repair.
- **Do not test the desk on live.** Test against stand-ins or an isolated stage (`ALCHEMY_STAGE`). On the live stack, a want runs real searches and fetches real books.
- **Deploy carefully.** Run `pnpm run deploy --yes` (`pnpm deploy` is a different, built-in pnpm command). Never delete `.alchemy/` while the stack is up; it is Alchemy's record of what is deployed.

## Vocabulary

`GLOSSARY.md` defines Prosody's domain terms (work, edition, pair, shelfmark, reading copy, place, want, the press, and others). Terms specific to fetching a book live in `docs/acquiring/GLOSSARY.md`. Use every term as defined across code, tests, UI copy and commit messages, and add a new entry whenever the model gains a concept.

## No comments in code

Code carries no comments of any kind: no doc comments, inline notes, `TODO`s, shebangs or tool directives (`oxlint-disable`, `@ts-expect-error`, etc.). Put the information where it stays maintained instead:

| What you wanted to write | Where it goes |
|---|---|
| Why a design choice was made | An ADR in `docs/adr/` |
| A hack, workaround or known shortcut | An issue in `docs/issues/` |
| A domain term | `GLOSSARY.md` (or `docs/acquiring/GLOSSARY.md`) |

`pnpm check` fails on any comment. The `prosody/no-comments` rule (`tools/oxlint/prosody`) reports comments in linted JavaScript and TypeScript, and `pnpm comments` catches comments hidden behind disable directives as well as comments in CSS, HTML, `Dockerfile`, YAML and `.dockerignore`. Fix errors in the code or config rather than silencing them inline. Run `/delete-comment` to triage and strip comments in bulk.

## Where to read before changing a part

Before changing any area, scan the titles in `docs/adr/` and `docs/issues/` and read the ADRs that touch it.

`docs/how-it-works.md` covers what the source alone does not explain: why each part is built as it is and what breaks if it changes. Read the relevant section before editing:

| Section in `docs/how-it-works.md` | Read before changing |
|---|---|
| "Deploying" | Deploy config, service settings or images, Alchemy, the cluster |
| "Signing in" | Caddy, the relay, Tailscale, `Session` |
| "The model" | Policies or views in `packages/domain` |
| "The press" | The walk, reading copies, its queue, covers, the aligner |
| "The reading room" | Places, the nightstand, the bar, panels and keys, following and yielding, the player, appearance, the lock screen, pages |
| "Offline" | The service worker, offline places, the shelf offline, kept copies |
| "The site" | The landing page, docs and blog in `packages/site` |
| "Known limits" | Known bugs and untested behaviour |

Additional area docs:

- **Acquiring (`docs/acquiring/`):** Read before changing `packages/domain/src/Acquisition`, the desk or shelving.
- **Public site (`packages/site`):** A Foldkit app built to static pages from Markdown files in `packages/site/content`. Serve it locally with `pnpm --filter @prosody/site dev` and deploy it to Cloudflare (independently of the host stack) with `pnpm --filter @prosody/site run deploy`. Pages are written for readers in the glossary's terms and never name what the desk fetches through. When app behaviour changes, update the matching page in the same commit.

## Architecture and APIs

- **Pure domain package.** `packages/domain/src/**` may import only `effect` and `@alchemy.run/domain`, enforced by `no-restricted-imports` in `oxlint.config.ts`.
- **Effect 4.** Read `node_modules/effect/AGENTS.md` before writing Effect code; Effect 4 differs significantly from v3. Before using an Effect module marked unstable, add it to `allowedUnstableApis` in `tsconfig.base.json`.
- **Effect service shape.** Follow the conventions encoded in `tools/oxlint/anti-slop/effect`. Where those rules disagree with `node_modules/effect/AGENTS.md`, Effect's guide wins.
- **Alchemy.** `@alchemy.run/domain` and `@alchemy.run/effect-cluster` are pre-release betas (`2.0.0-beta.87`). Read the installed source in `node_modules` and Alchemy's docs for its domain, cluster and docker packages before writing against them. Keep Alchemy on the newest release.

## Checks and tooling

`pnpm check` runs the full gate: `oxfmt --check`, `pnpm lint` (`oxlint && pnpm comments`), `pnpm typecheck` (`tsc --noEmit && pnpm -r typecheck`) and `pnpm test` (`vitest run --passWithNoTests`). Warnings fail the build (`denyWarnings: true`). Run `pnpm fix` (`oxlint --fix && oxfmt`) for safe lint fixes and formatting.

- **TypeScript and type-aware lint.** `typescript` and `tsrs` are both on 7.1 beta, and Oxlint runs its type-aware rules through `tsrs`. The `prepare` script runs `effect-tsgo patch --oxlint --tsrs` so `oxlint` behaves the same in scripts, editors and hooks. Upgrade `typescript`, `tsrs`, `oxlint` and `@effect/tsgo` together to versions listed as supported in `node_modules/@effect/tsgo/README.md`.
- **Lint layers (`oxlint.config.ts`):**
  1. **Ultracite** (`ultracite/oxlint/core`, `ultracite/oxlint/vitest`). Where Ultracite and Effect conventions conflict, Effect wins: barrel imports from `effect`, `Array<A>` generics, and kebab-case or PascalCase filenames. Each override is listed in `oxlint.config.ts`.
  2. **Effect** (`@effect/tsgo` `recommended` preset with `effecttsgo/schema-class-missing-brand` off, plus twelve extra rules): barrel imports from `effect`; using Effect's `Config`, `Clock`/`DateTime`, `Schema`, `HttpClient`, `Effect.log`/`Logger` and `SecureRandom` (`effect/crypto`) inside Effects rather than globals; requiring catch handlers on `Effect.try`/`Effect.tryPromise`; forbidding direct `extends Error`; requiring explicit `concurrency` on `Effect.all`/`Effect.forEach`; using the array form of `Effect.provide`; and `strict-effect-provide` (disabled only in the four entry points listed in `oxlint.config.ts`).
  3. **Anti-slop** (`tools/oxlint/anti-slop`, provenance in `tools/oxlint/anti-slop/UPSTREAM.md`). All core and Effect rules are enabled as errors. We own this copy: adjust a rule there instead of turning it off file by file. Its `martinfowler/` code-smell rules (intended as warnings) and LLM-judged `jev/` and `diff-rules/` suites are intentionally disabled.
  4. **Prosody** (`tools/oxlint/prosody`): enforces `prosody/no-comments`.
- **Edit hook.** `.claude/settings.json` runs `oxlint --fix` and `oxfmt` automatically after every `Edit` or `Write` tool call.

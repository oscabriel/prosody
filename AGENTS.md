# Prosody

One self-hosted app for the whole route a book travels: wanting it, fetching it, shelving it, syncing its audiobook to its ebook, and reading or listening. It does the work of a book grabber, an audiobook server, an ebook reader and an aligner in one. the indexer and the download client stay outside it.

## State

Step 1 is done: each book with both editions is paired, aligned by the press with our own aligner (`packages/aligner`), spot-checked by ear, kept as a reading copy in the copies folder, and opens at `/read/<work>`, where the audio follows the text and one place per book is kept across devices. The Api serves the built app at `https://read.example.com`, to your own devices only. `pnpm check` must pass before a commit. The next work is step 2: the app installed on the phone, playing from the lock screen and offline.

- `pnpm check` formats, lints, typechecks and tests. `pnpm run deploy` deploys; `pnpm deploy` is a different, built-in pnpm command.
- `packages/domain` imports only `effect` and `@alchemy.run/domain`. The linter enforces it.
- The Api serves the built app: `/`, `/read/<work>` and the hashed files under `/assets/`, which browsers keep for a year. `pnpm run deploy` and `pnpm run plan` build `packages/web` first; the build is the Api's base image, `PageImage` (`packages/web/Dockerfile`), tagged with a fingerprint of the build and the Dockerfile so a change to either moves the Api. The dev server (`pnpm --filter @prosody/web dev`) still runs at `https://prosody.example.com`, behind the same sign-in.
- Sign-in is Tailscale's. Before every request to `read.example.com` or `prosody.example.com`, Caddy asks the Api's `/auth` about the address it came from (`X-Prosody-Peer`), and the Api asks tailscaled whether that is an untagged machine of the host's own owner. `/auth` also refuses a request made by another site's page (its `Origin` or `Sec-Fetch-Site`), since the tailnet vouches for a machine, not for what runs on it. Caddy copies the machine's name onto the request as `X-Prosody-Device`. The reader's Api (the `Session` middleware, which gives `decide` the `Device`) and `/copies` refuse a request without it with `SignedOut`. Anything on the host that calls the relay directly can name any device; nothing off the host can reach the relay. The press's `/press` is still refused to anything that comes through the relay.
- The Api reaches tailscaled through its socket, in `/var/run/tailscale`, which it mounts. It runs as `nobody`: tailscaled takes settings from root and from its operator (you, uid 1000), and only answers anyone else. A mount cannot limit a socket, so keep that `USER`. systemd makes the folder anew whenever tailscaled starts; the Api's healthcheck then fails and swarm replaces it. `docker service update --force` on the Api does the same by hand.
- `.alchemy/` is Alchemy's record of what is deployed. Never delete it while the stack is up.
- The press runs in its own base image, `packages/press/image/Dockerfile`, as uid 1000. Bump `PressImage`'s tag in `Press.ts` whenever the Dockerfile changes, or the press keeps the old image.
- Alchemy runs a service's setup on the host when it plans a deploy. Anything that touches the container's own files or mounts goes inside `host.run`.
- Alchemy 2.0.0-beta.87 misses a change to a service's code alone when the service's settings depend on other resources. The Api and the press carry `PROSODY_SOURCE`, a fingerprint of the source (`packages/server/src/Source.ts`), so code changes deploy; give any new service the same.
- Policies act only on new events, never on history. A rule that must also cover what is already recorded needs another trigger: the press reports pairs on every walk for this reason.
- Bump a view's `version` whenever what it computes changes, so it is rebuilt from the history.
- `.pending` in the copies folder is the press's queue. A request stays there until its answer is sent.
- The Api serves the reading copies read-only at `/copies/<work>/`: `contents.json`, `timeline.json`, `text/` and `audio/`. A copy without `contents.json` is unfinished or was made before the reading room; `RealignNarration` makes it again.
- The aligner runs NVIDIA's Parakeet CTC 0.6B (int8 ONNX) through `@huggingface/transformers`, and Whisper base.en for the spot check. The press image downloads both at pinned revisions into `/models` and runs offline; the bundle leaves `@huggingface/transformers` external, installed in the image's `/app`. Changing either model means a new image tag.
- What the model heard is kept beside each reading copy as `heard-<size>.emissions`, so a realign never listens again. Change the emissions format and those files must be ignored or rebuilt.
- `packages/aligner/bench` runs the aligner on saved emissions, outside the press: `run.ts` end to end, `align.ts` to try costs, `reorder.ts` and `unread.ts` for audio out of order or text not read.

## Before using an API

- Alchemy's domain framework (`@alchemy.run/domain`) and its Effect Cluster host are weeks old. Read the installed `node_modules` source, and Alchemy's own docs, before writing against them. The code in the plan is a sketch that was never run.
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
- For how to shape Effect services, use the `effect-program-design` skill. It is anti-slop's policy, the one its Effect rules encode, installed globally and adapted to Effect 4.1.4 (its `LOCAL-CHANGES.md` lists how). Where it still disagrees with `node_modules/effect/AGENTS.md`, Effect's wins.
- `.claude/settings.json` runs `oxlint --fix` and `oxfmt` on every file an agent edits.

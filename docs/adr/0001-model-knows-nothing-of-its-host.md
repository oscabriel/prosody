# Keep the domain model independent of its host

## Decision

Everything under `packages/domain/src/` imports only `effect` and `@alchemy.run/domain`. `oxlint.config.ts` enforces this with `no-restricted-imports` on `packages/domain/src/**`.

Any work the model needs from outside is declared as a port in `packages/domain/src/`:

- `Indexer` (`packages/domain/src/Acquisition/Indexer.external.ts`)
- `Downloads` (`packages/domain/src/Acquisition/Downloads.external.ts`)
- `Metadata` (`packages/domain/src/Library/Metadata.external.ts`)
- `Stacks` (`packages/domain/src/Library/Stacks.external.ts`)
- `Aligner` (`packages/domain/src/Narration/Aligner.external.ts`)
- `Copier` (`packages/domain/src/Reading/Copier.external.ts`)

Adapters in `packages/server/src/` (wired in `packages/server/src/ProsodyLive.ts`) and the press (`packages/press/src/Press.ts`) implement those ports.

## Why

Keeping infrastructure out of `packages/domain` lets every aggregate, policy and view rule be tested as a fast in-memory story (`packages/domain/test/*.story.test.ts`) without Docker, Postgres or book files. Swapping an indexer, download client or metadata source only requires a new adapter layer in `packages/server`.

## What breaks if you change this

- Importing Node, Bun, filesystem, HTTP or database modules into `packages/domain/src/` fails `pnpm check`.
- Domain story tests stop running in isolation and begin requiring external services or real files.
- Replacing an external integration forces changes to domain policies instead of a single adapter.

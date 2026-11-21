# Enforce strict zero-warning checks, Effect's style and pinned catalog versions

## Decision

`pnpm check` runs `oxfmt --check && pnpm lint && pnpm typecheck && pnpm test`.

Linting (`oxlint.config.ts`) runs with `typeAware: true`, `denyWarnings: true` and `reportUnusedDisableDirectives: "error"`, combining three rule sets plus `prosody/no-comments`: Ultracite (`core`, `vitest`), Effect's rules (`@effect/tsgo/oxlint-presets` `recommended` plus 12 stricter rules enforcing Effect's `Config`, `Clock`, `Schema`, `HttpClient`, `Console`, `Random`, catch handlers, explicit concurrency and `Effect.provide`), and `tools/oxlint/anti-slop`. Where Effect's conventions disagree with Ultracite's, Effect's win (barrel imports, `Array<A>`, PascalCase filenames). `strict-effect-provide` is disabled only for the four entry points (`Press.ts`, `Api.ts`, `Source.ts`, `entry.ts`).

`pnpm-workspace.yaml` pins coupled versions in `catalog:` (with `overrides: { effect: 4.1.4 }` for a single Effect instance) and sets `allowBuilds: false` for `esbuild`, `onnxruntime-node`, `protobufjs` and `workerd`.

## Why

- Denying warnings means every rule is either an error or explicitly off, preventing warning drift.
- Requiring Effect's `Config`, `Clock`, `Schema`, `HttpClient`, `Console` and `Random` inside Effects keeps services deterministic and testable with in-memory layers.
- Pinning coupled versions (`typescript`, `tsrs`, `@effect/tsgo`, `alchemy`, `effect`) in one catalog prevents mismatched checker/linter patches and duplicate Effect instances.
- Disabling `allowBuilds` for `onnxruntime-node`, `protobufjs`, `esbuild` and `workerd` avoids running unnecessary postinstall scripts on the host (the press installs `@huggingface/transformers` inside its own Docker image).

## What breaks if you change this

- Upgrading `typescript`, `tsrs` or `@effect/tsgo` independently breaks `prepare` (`effect-tsgo patch --oxlint --tsrs`) or causes `unknown rule: effecttsgo/...`.
- Removing `overrides.effect` risks pulling two copies of Effect into the workspace, breaking Effect's type-id and service identity checks at runtime.
- Turning off Effect's global-API rules lets `Date.now()`, `fetch` or `process.env` leak into Effects and makes tests flaky or host-dependent.

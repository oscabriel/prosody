# Dev server pre-bundles Effect entries by hand

**Where:** `optimizeDeps` in `packages/web/vite.config.ts`

## What is wrong

`packages/web/vite.config.ts` manually sets `optimizeDeps.include` to `["effect", "effect/Function", "effect/http"]`. This was added because `@foldkit/vite-plugin` excludes `foldkit` from Vite's dependency optimisation, which previously prevented Vite from discovering Foldkit's Effect imports and caused dev mode to load a second copy of Effect alongside the app's.

The installed `@foldkit/vite-plugin` (`0.29.0`) now includes a `configEnvironment` hook (`FORCE_INCLUDED_EFFECT_ENTRIES`) that automatically adds `"effect"`, `"effect/Function"`, and every other top-level Effect subpath Foldkit imports. (`"effect/http"` is not in that list, as Foldkit does not import it, so Vite's own scanner from `src/entry.ts` should cover it.)

## What it costs

A hand-maintained `optimizeDeps.include` list in `packages/web/vite.config.ts` that duplicates plugin behaviour and can drift from the Effect subpaths actually imported.

## How to fix

Remove `include: ["effect", "effect/Function", "effect/http"]` from `optimizeDeps` in `packages/web/vite.config.ts`, start the dev server (`pnpm --filter @prosody/web dev`), and verify that Effect (including `effect/http`) is loaded as a single instance without duplicate-module errors.

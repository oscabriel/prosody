# Forbid comments of any kind in tracked source files

## Decision

Tracked source files carry no comments at all: no inline notes, no doc comments, no `TODO`s and no tool disable directives.

`pnpm lint` enforces this twice:

1. `prosody/no-comments` (`tools/oxlint/prosody/index.ts`) flags every comment in TypeScript files during `oxlint`.
2. `pnpm comments` (`node tools/oxlint/prosody/comments.ts check`) scans tracked source files directly, including CSS, HTML, Dockerfiles and YAML, catching any comment hidden behind a lint-disable directive. (Only `tools/oxlint/anti-slop/`, `pnpm-lock.yaml` and `.env.example` are skipped.)

What would otherwise live in a comment goes into its dedicated document: a design decision in `docs/adr/`, a known hack in `docs/issues/`, and a domain term in `GLOSSARY.md` (or `docs/acquiring/GLOSSARY.md`). Tooling requirements are expressed in config rather than directives: for example, `packages/web/tsconfig.json` includes `"WebWorker"` in `compilerOptions.lib` instead of a `/// <reference lib="webworker" />` comment.

## Why

Comments are not checked by the compiler or tests, so they drift out of date as code changes, and disable comments let shortcuts and lint suppressions accumulate silently. Putting decisions, issues and terminology in dedicated docs keeps them discoverable and reviewable, and forcing errors to be fixed in code or config prevents local suppressions.

## What breaks if you change this

- Adding any comment or `// oxlint-disable` directive fails `pnpm check`.
- Removing `pnpm comments` while keeping only `prosody/no-comments` lets comments slip back into non-TypeScript files (CSS, Dockerfiles, YAML) or hide behind disable directives in TypeScript.

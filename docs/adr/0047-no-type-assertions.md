# Code has no type assertions

## Decision

No file under `packages/` or in `alchemy.run.ts` asserts a type with `as T` or `<T>value`. `as const` is the one exception.

Nothing states this as a rule of its own. It follows from two lint rules in `oxlint.config.ts` that are both errors:

- `anti-slop/require-safety-comment-for-type-assertion` refuses a type assertion unless a comment marked `SAFETY:` sits above it. It skips `as const`.
- `prosody/no-comments` refuses every comment ([ADR 0043](0043-code-carries-no-comments.md)).

An assertion would need the comment, and the comment cannot be written, so `pnpm check` fails on any assertion.

## Why

Both rules were turned on for their own reasons, and the ban is what they add up to. It is kept rather than undone because the code already lives within it: a value whose type the checker cannot see is decoded with `Schema` or narrowed with a guard, and the source has no assertion to exempt.

## What breaks if you change this

- Turning off `anti-slop/require-safety-comment-for-type-assertion` lets assertions in with nothing to justify them.
- Allowing `SAFETY:` comments means an exception to `prosody/no-comments`, and to `pnpm comments`, which checks the same thing outside the linter.
- A library whose types force an assertion has no escape hatch here. Wrap it behind a function that decodes or narrows what it returns, or change this record first.

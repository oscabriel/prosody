# Views routed through `keyOf` cannot be backfilled

**Where:** `Shelf` in `packages/domain/src/Library/Shelf.view.ts`, `Nightstand` in `packages/domain/src/Reading/Nightstand.view.ts`, and `Wanted` in `packages/domain/src/Acquisition/Wanted.view.ts`

## What is wrong

On Alchemy `2.0.0-beta.87`'s Effect Cluster host, any view routed through `keyOf` fails to backfill past events when it is added or when its `version` is bumped. During backfill, `@alchemy.run/domain`'s `DurableObjects.ts` serialises `list(path, after)` arguments with `JSON.stringify`, turning `after: undefined` into `null`. `Backfill.makeNode().list` in `Backfill.ts` checks `after === undefined`, treats `null` as a real cursor, and queries storage with `startAfter: null` (matching no rows).

Because of this, `Shelf` remains on `version: 1` (adding `copies` and `pages` with `Schema.withDecodingDefaultKey` rather than bumping its version), and `Nightstand` started empty when it was first deployed.

## What it costs

- Bumping `version` on `Shelf`, `Nightstand`, or `Wanted` wipes their state instead of rebuilding it from aggregate history.
- Adding a new `keyOf` view over existing aggregates misses all earlier events.
- Schema changes to these views are restricted to backwards-compatible additions with decoding defaults.

## How to fix

Check whether a newer Alchemy release fixes the `after: undefined` to `null` serialisation bug in `@alchemy.run/domain` (`Backfill.ts` / `DurableObjects.ts`), or report it upstream. Until it is fixed, keep using decoding defaults for schema additions, or add an explicit rebuild path (for example, a command that has the press re-report library state into a fresh view).

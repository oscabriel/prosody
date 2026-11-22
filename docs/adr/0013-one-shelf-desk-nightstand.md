# Keep one singleton instance for Shelf and Wanted, with separate maps per aggregate

## Decision

Two library-wide views each exist as a single instance keyed by `SHELF` (`ShelfName.make("main")`):

- `Shelf` (`packages/domain/src/Library/Shelf.view.ts`): fed by `Work`, `Narration` and `Copy`, storing `works`, `syncs` and `copies` as separate records.
- `Wanted` (`packages/domain/src/Acquisition/Wanted.view.ts`): fed by `Want`, `Work` and `Grab`, storing `wants`, `catalogue` and `grabs` as separate records.

`Nightstand` (`packages/domain/src/Reading/Nightstand.view.ts`) originally shared the `SHELF` singleton, and was later partitioned per reader (`key: ReaderId`, storing `works` keyed by `WorkId`) when Prosody gained multi-user accounts ([ADR 0053](0053-readers-sessions-and-single-sign-on.md)).

The web app joins these records when rendering (`booksOf` in `packages/web/src/ShelfBooks.ts`, `packages/web/src/Desk.ts`, `packages/web/src/Grabbed.ts`).

## Why

Events emitted by different aggregates have no guaranteed delivery order relative to one another. For example, `AlignmentStarted` from `Narration` can arrive at `Shelf` before `WorkCatalogued` from `Work`. Keeping each aggregate's slice in its own record lets every `evolve` handler write its slice unconditionally without dropping updates that arrive early.

## What breaks if you change this

- Merging `syncs` or `copies` into `Shelf.works[id]` (or `catalogue` into `Wanted.wants[id]`) causes out-of-order events to be silently ignored when the parent entry does not exist yet.
- Changing the singleton key `SHELF` (`"main"`) orphans existing persisted view snapshots in Postgres.

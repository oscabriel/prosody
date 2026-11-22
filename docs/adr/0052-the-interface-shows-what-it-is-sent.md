# Show only what already reaches the browser

## Decision

Every screen in `packages/web` is rendered strictly from the data already sent by the model's views (`Shelf`, `Nightstand`, `Wanted`, `Place`), the open reading copy (`contents.json`, `timeline.json`) and local kept-copy metadata (`DeviceCopies.ts`). When the browser does not have a figure, the interface omits it rather than estimating it:

- **No progress bars on the shelf:** `Shelf` and `Nightstand` carry no book length, page count or share read, so shelf cards and rows show no progress bar, percentage or time remaining. Nightstand cards display only what `Standing` provides: the last-read device and date.
- **No pre-download size on Keep:** `Contents` carries no byte size, so **Keep on this device** shows no size before downloading. The size appears while downloading (when `copying.of > 0`) and once kept (`packages/web/src/DeviceCopies.ts`). When the total is not yet known (`copying.of === 0`), the UI shows `Keeping…` and an indeterminate bar rather than a percentage.
- **No invented sync percentage:** an open pair's book menu shows the press's own prose note from `Shelf.syncs` inside **Synced** while online, and omits the section when offline.
- **Time remaining only where computable:** pairs derive remaining time from `timeline.json` and audio alone from `contents.chapters`. Text alone shows `Section N of M` at the foot because the lengths of unread sections are not sent.
- **Technical details stay behind a disclosure:** shelf cards show only that a copy failed (`Not synced` or `Not copied`); opening the room puts the underlying error behind **Technical details**.

Shelf search, sorting and filter chips operate client-side over those same view snapshots (`packages/web/src/ShelfBooks.ts`).

## Why

The web overhaul was scoped strictly to `packages/web`, with no changes to `packages/domain`, `packages/server` or `packages/press`. Estimating progress or file sizes on the client would produce numbers that look measured but are frequently wrong, which erodes trust more than leaving them out. Keeping the boundary explicit also makes it clear that features such as shelf progress require extending `Nightstand` in the domain model, not inventing approximations in the UI.

## What breaks if you change this

- Computing a percentage from a place alone (a sentence id or page number without a known total length) displays misleading progress for most books.
- Dividing `copying.done` by `copying.of` without guarding `copying.of > 0` renders `NaN%` for text-alone and pages copies or during the initial phase of keeping a pair.
- Fetching every book's `contents.json` or `timeline.json` just to render shelf progress turns a single `Shelf` subscription into a network request per book.
- Adding UI-driven fields to `Shelf` or `Nightstand` is a domain model change and must follow its compatibility rules ([ADR 0007](0007-stored-state-read-with-defaults.md), [issue 0004](../issues/0004-views-cannot-be-rebuilt.md)).

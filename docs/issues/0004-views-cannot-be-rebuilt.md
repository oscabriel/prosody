# A view fed by several aggregates cannot be rebuilt

**Where**: `Shelf` in `packages/domain/src/Library/Shelf.view.ts`; also `Nightstand` and `Wanted`

On the platform's cluster host, a view routed through `keyOf` that is added or has its `version` bumped is backfilled from no history and starts empty. So the shelf has gained copies and pages with no new version, which is right only because every such event is newer than the change, and `Nightstand` started empty when it was added.

**To fix**: Confirm the backfill bug against the newest Alchemy and report it upstream; until then, give these views a way to be rebuilt, such as a command that has the press report everything again into a fresh view.

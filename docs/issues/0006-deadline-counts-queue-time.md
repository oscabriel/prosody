# An alignment's deadline counts the time it waits in the press's queue

**Where**: `ALIGNMENT_WINDOW` in `packages/domain/src/Narration/Narration.aggregate.ts`

A try has six hours from the moment it is asked, and the press aligns one book at a time. The comment reasoned that ten books take about two hours; a library of thirty or more new pairs has tries expire while they wait, and their late answers are then ignored.

**To fix**: Start the deadline when the press takes the request off its queue, or have the press say it has begun.

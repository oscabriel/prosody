# Number every search and try so only the latest answer counts

## Decision

Long-running asynchronous work is tracked with a monotonically increasing number on its aggregate, with one active run at a time:

- **Want search** (`packages/domain/src/Acquisition/Want.aggregate.ts`): `SearchStarted` increments `search`; `OfferReleases` and `RecordSearchFailed` record nothing unless `want.isWanted && want.search === cmd.search`.
- **Narration alignment** (`packages/domain/src/Narration/Narration.aggregate.ts`): `AlignmentStarted` sets `attempt`; `RecordAlignment`, `RecordAlignmentFailed` and `ExpireAlignment` record nothing unless `status === "aligning" && attempt === cmd.attempt`.
- **Edition-alone copy** (`packages/domain/src/Reading/Copy.aggregate.ts`): `CopyStarted` increments `attempt`; `RecordCopy` and `RecordCopyFailed` record nothing unless `status === "copying" && attempt === cmd.attempt`.

For alignments, `Alignment` (`packages/domain/src/Narration/Alignment.policy.ts`) schedules `ExpireAlignment` on the same `Narration` aggregate after `ALIGNMENT_WINDOW` (`"6 hours"`) before calling `aligner.align(...)`.

## Why

Network delays, retries and restarts mean answers from an older search or try can arrive after a newer one has started. Checking the attempt number on the aggregate makes stale answers harmless no-ops. Scheduling `ExpireAlignment` before invoking the press ensures that even if the press crashes or drops the request, the aggregate still resolves the race cleanly.

## What breaks if you change this

- Dropping the attempt or search check allows a slow previous search or alignment to overwrite a newer result.
- Moving `narrations.schedule(ExpireAlignment)` after `aligner.align(...)` leaves an alignment stuck in `"aligning"` forever if the press call fails or hangs.
- Running the deadline outside the `Narration` aggregate creates a race where both an answer and a timeout can succeed for the same try.

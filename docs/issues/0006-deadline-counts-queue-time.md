# Alignment deadline counts queue wait time

**Where:** `ALIGNMENT_WINDOW` in `packages/domain/src/Narration/Narration.aggregate.ts` and `AlignmentLive` in `packages/domain/src/Narration/Alignment.policy.ts`

## What is wrong

When `AlignmentStarted` is recorded, `AlignmentLive` immediately schedules `ExpireAlignment` for `ALIGNMENT_WINDOW` (`"6 hours"`) later and posts the request to the press. The press drains `pending.waiting` one request at a time (`packages/press/src/Press.ts`), sharing that queue between alignments and edition-alone copies. As a result, the six-hour deadline starts while the request is still waiting in the queue, not when alignment begins.

## What it costs

When many new pairs are queued at once (such as onboarding a large library), tries near the back of the queue time out before the press reaches them and fail with `"the press did not answer within 6 hours"`. When the press later completes those tries, `Narration` ignores the late answers because the attempt is no longer in `"aligning"` status, wasting hours of CPU work and requiring manual realigns.

## How to fix

Start the `ExpireAlignment` deadline when the press actually takes a request off `pending.waiting` and begins aligning it (for example, by having the press send a command marking the try as started, and scheduling `ExpireAlignment` from that event instead of `AlignmentStarted`).

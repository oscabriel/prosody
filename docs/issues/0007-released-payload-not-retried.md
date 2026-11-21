# A released payload stays in the download client when it cannot be reached

**Where**: `ReleasingLive` in `packages/domain/src/Acquisition/Releasing.policy.ts`

When Downloads fails, the policy logs a warning and ends. The grab is already recorded as released, so nothing tries again and the torrent seeds on until it is removed by hand.

**To fix**: Let the failure fail the policy so the platform runs it again, or record that the removal is still owed and retry it from the press's watch.

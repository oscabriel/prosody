# Something asked at the desk and lost offline is not sent again

**Where**: `packages/web/src/Wants.ts` and `packages/web/src/Correcting.ts`

A place kept offline waits on the device and is sent when the model can be reached. A want, a correction or a grab whose answer is lost is only reported: the desk says it was not sent and you ask again.

**To fix**: Queue the desk's commands with their ids the way places are queued, or decide that the desk is online-only and say so before a form can be sent.

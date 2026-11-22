# Desk commands lost offline are not retried

**Where:** `packages/web/src/Wants.ts`, `packages/web/src/Correcting.ts`, `packages/web/src/Grabs.ts`, and the views in `packages/web/src/Desk.ts` and `packages/web/src/Grabbed.ts` (compared with `packages/web/src/Places.ts`)

## What is wrong

Places kept offline are stored in `localStorage` with their `commandId` and replayed when the connection returns (`sendWaiting` in `packages/web/src/Places.ts`). Desk commands have no offline queue; instead, the desk is treated as online-only, and that guard is incomplete:

- While `!model.isOnline`, the desk shows an offline banner and disables its form fields, **Want it** and action buttons (`Desk.ts`, `Correcting.ts`, `Grabbed.ts`).
- `submitWant` (`Wants.ts`) and `submitCorrection` (`Correcting.ts`) also refuse submission while `!model.isOnline`, leaving the text in the form (`"Can't reach the desk. Your book is still in the form."` / `"Can't reach the desk. Your correction is still in the form."`).
- `sendAbout` (`Wants.ts`), `sendGrab` and `sendGrabMove` (`Grabs.ts`) still dispatch `SearchAgain`, `WithdrawWant`, `GrabRelease`, `ResumeGrab`, `AbandonGrab` and `ReleasePayload` without checking `model.isOnline`, so a confirmation dialog opened before the connection dropped can still send one.
- When any desk command fails with `Unknown` (such as a dropped connection mid-request), `deskFailed` in `Wants.ts` marks the connection lost and shows `"Not sent: the model could not be reached."`, discarding the command and its `commandId`.

## What it costs

If a desk action's response is lost in transit, it is not retried automatically. The reader must notice the message and submit again, which allocates a fresh `commandId` (and for `WantBook`, mints a second work id if the first request actually reached the server).

## How to fix

Either:

- Persist pending desk commands with their `commandId` in `localStorage` and replay them on reconnect, following `packages/web/src/Places.ts`, or
- Complete the online-only treatment: refuse commands in `sendAbout`, `sendGrab` and `sendGrabMove` while `!model.isOnline`, and retain the `commandId` of an `Unknown` failure for a manual retry.

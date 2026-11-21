# Desk commands lost offline are not retried

**Where:** `packages/web/src/Wants.ts`, `packages/web/src/Correcting.ts`, and `packages/web/src/Grabs.ts` (compared with `packages/web/src/Places.ts`)

## What is wrong

Places kept offline are stored in `localStorage` with their `commandId` and replayed when the connection returns (`sendWaiting` in `packages/web/src/Places.ts`). Desk commands have no offline queue:

- `submitWant` (`Wants.ts`) and `submitCorrection` (`Correcting.ts`) refuse submission while `!model.isOnline`, leaving the text in the form (`"Can't reach the desk. Your book is still in the form."` / `"Can't reach the desk. Your correction is still in the form."`).
- `sendAbout` (`Wants.ts`), `sendGrab`, and `sendGrabMove` (`Grabs.ts`) dispatch `SearchAgain`, `WithdrawWant`, `GrabRelease`, `ResumeGrab`, `AbandonGrab`, and `ReleasePayload` without checking `model.isOnline`.
- When any desk command fails with `Unknown` (such as a dropped connection mid-request), `deskFailed` in `Wants.ts` marks the connection lost and shows `"Not sent: the model could not be reached."`, discarding the command and its `commandId`.

## What it costs

If a desk action's response is lost in transit, it is not retried automatically. The reader must notice the message and submit again, which allocates a fresh `commandId` (and for `WantBook`, mints a second work id if the first request actually reached the server).

## How to fix

Either:

- Persist pending desk commands with their `commandId` in `localStorage` and replay them on reconnect, following `packages/web/src/Places.ts`, or
- Treat the desk as online-only: disable all desk action buttons while `!model.isOnline`, and retain the `commandId` of an `Unknown` failure for a manual retry.

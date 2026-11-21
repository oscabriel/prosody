# Queue place updates locally with stable command ids and wait three seconds for the model

## Decision

Offline reading state is queued intent in `localStorage` (`packages/web/src/Places.ts`, `packages/web/src/Connection.ts`, `packages/web/src/Main.ts`):

- **Local-first saves**: `keep` persists the place with a stable `commandId` under `"prosody:places"` and sends `KeepPlace` if online. `commandId` stays set until `SucceededKeepPlace` (or a domain rejection) clears it; on network failure, `sendWaiting` resends under the same `commandId` on boot and on reconnect.
- **Opening a room**: Online opens start `WaitForPlace` (`PLACE_WAIT = 3s`). If the model answers first, the newer of the device's place and the model's wins; if 3 seconds pass (or the watch fails), the room opens at the device's stored place.
- **Reconnection**: After a network failure, `TryAgain` polls `HEAD /` every 5 seconds (`TRY_AGAIN_AFTER`) until a 2xx answer fires `WentOnline`.

## Why

- Reusing the same `commandId` on retries makes `KeepPlace` idempotent in `@alchemy.run/domain`: if the first request reached the server but the response was lost, retrying does not record a duplicate event.
- Waiting 3 seconds for the model's place lets online devices pick up progress from another device without hanging forever when a phone is on a dead or flaky network that still reports `navigator.onLine === true`.
- Polling `HEAD /` every 5 seconds detects when the server or tailnet becomes reachable again even when the browser does not fire a `window` `"online"` event.

## What breaks if you change this

- Minting a new `commandId` on retry instead of persisting it in `prosody:places` breaks command deduplication after dropped responses.
- Removing `WaitForPlace` leaves a room stuck without settling its place when `navigator.onLine` is true but the tailnet or server is unreachable.
- Removing `TryAgain` leaves the app stuck offline after a transient server restart because `window`'s `"online"` event only fires on OS interface changes.

# A place is a sentence, and only a newer timestamp wins

## Decision

`Reading` (`packages/domain/src/Reading/Reading.aggregate.ts`) stores one `KeptPlace` per work (`packages/domain/src/Reading/Sentence.ts`):

- For a pair or a text alone, the locator is `sentence` (`<section path>#<span id>`).
- For audio alone, it is `time` (seconds).
- For pages alone, it is `page` (1-based page number).

`KeepPlace` compares timestamps (`at`):

- If `place !== null && place.at > cmd.at`, it rejects with `StalePlace` (carrying `keptAt`).
- If `at` and all locator fields match the stored place, it records nothing.
- Otherwise it emits `PlaceKept`, setting `device` from the `Device` context provided by `Session` (`packages/server/src/Session.ts`), never from the command input.

## Why

- A sentence id locates the same spot in both the EPUB text and the aligned audio timeline, so reading and listening share one place.
- Rejecting older timestamps prevents a device that was offline from overwriting newer progress made on another device.
- Taking `device` from `Session` ensures a client cannot spoof another device's name in the event log or nightstand.

## What breaks if you change this

- Allowing an older `cmd.at` to overwrite a newer `place.at` lets a reconnecting phone drag your place backwards.
- Accepting `device` as a client-supplied command field breaks the trust boundary enforced by `SessionLive`.
- Storing only audio time for a pair breaks reading-only navigation and makes place dependent on audio encoding rather than text structure.

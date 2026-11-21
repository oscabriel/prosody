# Only the reader grabs a release, and Prosody holds no tracker credentials

## Decision

No policy in `packages/domain/src/` ever dispatches `GrabRelease`. A grab starts only when the reader explicitly chooses an offer from the want's latest search (`Want.aggregate.ts` rejects any release not in `want.offers` with `ReleaseNotOffered`).

Prowlarr (`packages/server/src/ProwlarrIndexer.ts`) holds all tracker accounts and cookies. Prosody stores only `INDEXER_URL` and `INDEXER_API_KEY`. When `ProwlarrIndexer` builds an offer (`linkOf`), it strips the `apikey` query parameter and stores only the path and remaining query string on `Release.link`, so the API key never enters an event. When a release is grabbed, `torrentOf` fetches the `.torrent` file through Prowlarr using the `X-Api-Key` header.

## Why

- Automatic grabbing risks downloading the wrong edition, an abridged recording or a low-quality file and incurring seeding obligations on your tracker without your approval.
- Keeping tracker logins in Prowlarr and stripping `apikey` before recording `ReleasesOffered` ensures secrets never leak into Postgres event logs or browser view snapshots.

## What breaks if you change this

- Dispatching `GrabRelease` from a policy removes human approval before committing to tracker download and seeding rules.
- Storing Prowlarr's full `downloadUrl` with `apikey` in `ReleasesOffered` persists the API key permanently in the event store and exposes it in the `Wanted` view sent to the browser.

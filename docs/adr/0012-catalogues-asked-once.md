# Query external catalogues once per want, using title and author only

## Decision

When a book is wanted (`BookWanted`), `Cataloguing` (`packages/domain/src/Library/Cataloguing.policy.ts`) calls `Metadata.describe({ title, author })` once and records the result via `CatalogueWork`. (`Shelving` in `packages/domain/src/Library/Shelving.policy.ts` calls it only as a fallback if a payload arrives before `Work` is catalogued.) Works already in the library are never sent to external catalogues, and embedded file metadata is ignored.

`OpenLibraryMetadata` (`packages/server/src/OpenLibraryMetadata.ts`) queries three public APIs with no account credentials:

- **Open Library**: `OPEN_LIBRARY_TIME = "8 seconds"`, dying on failure so the platform retries the policy. A returned title or author replaces the reader's input only when `completes(asked, found)` holds (every word typed appears in the result).
- **Audible catalogue**, then **Audnexus**: combined `RECORDING_TIME = "30 seconds"`, falling back to `null` if either fails or no exact title match is found.

## Why

- Sending only a wanted book's title and author avoids leaking your library to third parties and avoids trusting noisy embedded file tags.
- Requiring `completes(asked, found)` lets the catalogue expand an incomplete title or author without replacing the book you asked for.
- The platform reruns a policy that fails within 10 seconds, so Open Library is given 8 seconds to fail in time for a retry; audiobook lookups get 30 seconds and yield `null` on failure.
- Audible's public catalogue is queried only to find an ASIN because Audnexus has no search endpoint.

## What breaks if you change this

- Calling `Metadata.describe` on every library walk would send your entire library list to third-party APIs and hammer Open Library and Audible.
- Removing the `completes` guard allows an unrelated top search hit from Open Library to overwrite the title and author of a wanted book.
- Removing the fallback on Audible/Audnexus errors blocks cataloguing whenever Audnexus lacks an entry or times out.

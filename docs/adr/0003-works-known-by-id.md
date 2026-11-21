# Identify every work by its WorkId, never by title

## Decision

Every work in the model is keyed by a `WorkId` (`packages/domain/src/Library/Work.id.ts`), constrained to `/^w-[a-z0-9]+$/u`. No aggregate, view, folder or cache looks up a work by title.

Ids come from two places, both producing `w-` followed by 12 lower-case hex characters:

- **Works found in the library**: `Stacks.workIdOf` (`packages/press/src/Stacks.ts`) hashes the NFC-normalised shelfmark with SHA-256 and takes the first 12 hex characters.
- **Works wanted at the desk**: `MintWork` (`packages/web/src/Wants.ts`) generates 6 random bytes with `crypto.getRandomValues` on the device before anything is known about the book.

`packages/server/src/Copies.ts` validates `/copies/:work/...` requests against `/^w-[0-9a-f]{12}$/u`.

## Why

- A `WorkId` is safe to use directly as a folder name in `/copies`, a URL segment and a browser cache key without escaping.
- Hashing the shelfmark ensures every walk produces the same id for the same folder in the library.
- Minting a random id on the device lets a want exist before the book has a shelfmark or catalogue entry.

## What breaks if you change this

- Keying works by title breaks when a title is corrected (`CorrectTitle`), when two editions use slightly different titles, or when a title contains path characters.
- Changing the `w-` + 12 hex character format breaks `Copies.ts`'s route pattern (`/^w-[0-9a-f]{12}$/u`) and strands existing reading copies in `/copies` and browser caches.
- Changing the hash input or normalisation in `Stacks.workIdOf` mints new ids for existing library folders on the next walk, causing duplicate catalogue entries and re-alignment.

# The first work to claim a shelfmark holds the folder

## Decision

`ShelfmarkClaim` (`packages/domain/src/Library/ShelfmarkClaim.aggregate.ts`), keyed by `Shelfmark` (`Author/Title`), records the first `WorkId` that claims a folder.

- If the shelfmark is unclaimed, `ClaimShelfmark` records `ShelfmarkClaimed`.
- If the same work claims it again, it is a no-op.
- If a different work claims it, `ClaimShelfmark` rejects with `ShelfmarkTaken`, carrying the holding `WorkId`.

Both `Shelving` (`packages/domain/src/Library/Shelving.policy.ts`) and `Press.report` (`packages/press/src/Press.ts`) catch `ShelfmarkTaken` and route the edition to the holding work instead.

## Why

Two works can legitimately target the same `Author/Title` folder: a book wanted twice, or an audiobook grabbed for an ebook that is already on the shelf. Routing later claims to the first holder pairs the two editions under one work instead of creating duplicate works or `Title (2)` folders.

## What breaks if you change this

- Letting a second work overwrite a claim orphans the first work's reading copy, place and standing.
- Creating a disambiguated folder (such as `Title (2)`) prevents a newly grabbed audiobook from pairing with an already-shelved ebook of the same work.

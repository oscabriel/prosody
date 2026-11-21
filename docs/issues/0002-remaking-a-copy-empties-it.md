# Remaking a reading copy empties it first, so the book cannot be read meanwhile

**Where**: `freshFolder` in `packages/press/src/ReadingCopies.ts`

A new try empties the work's copy folder, keeping only what the speech model heard, and then builds the copy in place. From then until `contents.json` is written again the book does not open, which for a realign is a minute or two and for a first listen much longer.

**To fix**: Build the new copy in a folder beside the old one and swap them once its contents are written.

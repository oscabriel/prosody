# The reading room waits on animation frames for the page to be drawn

**Where**: `playerOnPage` in `packages/web/src/Player.ts`, and the two-frame wait in `packages/web/src/Text.ts`

A seek can be sent in the update that first draws the player, so the code looks for the audio element every frame for up to a second, and scrolling to a sentence waits two frames for a new section to appear. Both guess at timing instead of knowing when the element exists.

**To fix**: Run these from a mount on the element itself, as the `Leaf` mount in `Pages.ts` does, so they fire when it is there.

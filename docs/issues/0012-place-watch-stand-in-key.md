# The place watch is keyed by a made-up work while no room is open

**Where**: `NO_ROOM` in `packages/web/src/Main.ts`

The subscription that watches your place needs a key even when no room is open, so it is given `w-none`, a work id no work has, and reads nothing.

**To fix**: Make the place watch conditional on an open room, so there is no subscription and no stand-in id.

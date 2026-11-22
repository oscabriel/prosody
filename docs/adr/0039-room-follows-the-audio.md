# Keep reading-room highlighting steady through pauses and guard against premature place writes

## Decision

The reading room (`packages/web/src/Timeline.ts`, `packages/web/src/Rooms.ts`, `packages/web/src/Pages.ts`, `packages/web/src/Main.ts`, `packages/web/src/Places.ts`, `packages/web/src/RoomSubscriptions.ts`) follows six rules:

- **Steady highlight**: `sentenceAt` picks the last aligned sentence whose `start <= time`, ignoring `end`, so the highlight holds through pauses.
- **Unaligned text seek**: `startOf` plays from the first aligned sentence at or after the clicked sentence.
- **PDF page turns**: `Leaf` (`packages/web/src/Pages.ts`) emits `ShowedPage` only after a page stays on screen for 1 second, reading swipes and taps from `touchstart`/`touchend` (ignoring multi-touch and zoomed viewports) rather than pointer events; mouse clicks are read separately from pointer events with `pointerType === "mouse"`.
- **No premature saves**: Nothing is saved before `room.knowsPlace` is true; playback saves every `KEEP_EVERY = 15_000` ms, on pause, on sentence click, on scrubber release, and on manual audio-alone seeks.
- **Elsewhere banner**: Once `room.knowsPlace` is true, a newer `PlaceKept` from another device sets `room.elsewhere` (offering a jump) instead of pulling the reader away mid-read.
- **Yielding**: During paired playback, the page auto-scrolls to the spoken sentence only while `room.isFollowing` is true. Manual scrolling dispatches `YieldedFollow` and clears it; the highlight continues advancing, and following resumes only when the reader clicks **Back to playing**, presses `F` or play, or taps a sentence.

## Why

- Matching `start <= time && time <= end` would clear the highlight during every breath or pause between sentences, causing constant flicker.
- Using `touchstart`/`touchend` on mobile PDF pages ensures swipes and taps still register reliably even when the browser handles panning or pinch-zoom gestures.
- Waiting 1 second on a PDF page avoids flooding `KeepPlace` while flipping quickly through pages, and waiting for `room.knowsPlace` prevents a freshly opened room from overwriting the model's real place with page 1 or sentence 1.
- Offering a newer place from another device instead of jumping automatically avoids disorienting the reader if another tab or device syncs late.
- Auto-scrolling back to the narrator every few seconds fights a reader who scrolled away to check an earlier passage, so manual scrolling takes precedence until the reader returns.

## What breaks if you change this

- Checking `time <= entry.end` in `sentenceAt` makes the active sentence highlight blink off between every sentence.
- Recording `KeepPlace` before `room.knowsPlace` is true can overwrite your real reading progress with the start of the book on slow connections.
- Switching `Leaf` from `touchstart`/`touchend` to `pointerdown`/`pointerup` for touch inputs breaks page swipes on mobile browsers that cancel pointer events during pan/zoom.
- Removing the 1-second delay on `ShowedPage` sends a `KeepPlace` command for every intermediate page when flipping quickly.
- Dropping the `isScrollingItself` guard in `packages/web/src/Text.ts` causes programmatic follow scrolls to trigger `YieldedFollow`, disabling auto-follow after the first sentence.

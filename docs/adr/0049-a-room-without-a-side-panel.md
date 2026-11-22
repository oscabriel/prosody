# Give the reading room no side panel, and let controls recede while reading

## Decision

The reading room (`packages/web/src/Room.ts`) centres the book and keeps no permanent side panel beside it:

- **Top bar (`barView`):** holds the link back to the shelf, the contents button (omitted on pages editions with no headings), the display button (`Aa` for pairs and text alone, `Page` for pages, or the theme toggle for audio alone) and the book menu (`···`). In pairs and text alone, the bar hides after scrolling down more than 80 px and returns when scrolling up more than 12 px, within 40 px of the top, when the pointer enters the top 24 px `.room-peek-zone`, when focus enters the bar, when a panel opens, or on `Escape` (`roomChrome` and `chromeAfter` in `packages/web/src/RoomSubscriptions.ts`). In pages, tapping the middle half of the page toggles both the top bar and the bottom page bar (`turnOf` in `packages/web/src/Pages.ts`).
- **Bottom dock (`dockView` in `packages/web/src/Listening.ts`):** in a pair, play/pause, skip back 15 s, skip forward 30 s, the chapter scrubber and the speed button stay docked at the foot of the screen and do not auto-hide.
- **On-demand panels (`room.openPanel`):** contents, the full player sheet, appearance or page display, the book menu, playback speed, the sleep timer and go-to-page open one at a time. Once-per-book actions (finishing, setting aside, keeping on the device and realigning) live in the book menu (`bookMenuView` in `packages/web/src/Moves.ts`).
- **Sentence tap stays single-purpose:** tapping a sentence still seeks or moves your place there; tapping the text never toggles controls.

Audio alone has no reading column to clear space for, so its player fills the stage and its top bar remains visible.

## Why

The previous reading room kept a permanent side panel with the title, contents and housekeeping buttons. On desktop it claimed a quarter of the horizontal space; on phones it stacked above the opening line, forcing readers to scroll back to the top of the chapter to reach the shelf or contents. It also left no room for a scrubber or skip buttons on paired books.

Auto-hiding on scroll direction preserves single-tap sentence jumping without introducing tap ambiguity. Keeping the dock visible in pairs ensures pause is always one tap away while listening.

## What breaks if you change this

- Toggling controls on a text tap collides with tapping a sentence to move your place.
- Hiding the dock alongside the top bar puts pause two gestures away during playback.
- Allowing more than one panel to open at once breaks the focus management in `packages/web/src/RoomPanels.ts`, which moves focus into the newly opened panel and restores it to the opener when closed.
- Moving `<audio id="prosody-player">` inside the dock or player sheet instead of mounting it at the room root (`audioView`) remounts the element and interrupts playback whenever the sheet opens or closes.
- Removing the `isJumpingItself` check in `roomChrome` causes programmatic jumps to a sentence to hide the top bar.

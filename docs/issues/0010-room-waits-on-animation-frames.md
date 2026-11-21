# Reading room polls animation frames for DOM elements

**Where:** `playerOnPage` in `packages/web/src/Player.ts`, and `drawn` (used by `Show` and `ToTop`) in `packages/web/src/Text.ts`

## What is wrong

Two parts of the reading room guess at DOM render timing with `requestAnimationFrame` because commands can be dispatched in the same update that mounts the elements they target:

- `Seek` calls `playerOnPage`, which queries `#prosody-player` once per animation frame for up to 60 frames (about 1 second at 60 Hz) until the `<audio>` element exists, then silently gives up.
- `Show` and `ToTop` wait on `drawn` (two nested `requestAnimationFrame` calls) before calling `scrollIntoView` or `window.scrollTo`, assuming the new section has rendered by then.

## What it costs

Timing guesses can drop an initial seek on a slow render (after 60 frames) or fire a scroll before or after the section finishes painting, causing missed scrolls or visible jumps.

## How to fix

Trigger initial seeks and section scrolls from Foldkit `Mount` hooks attached to the `<audio>` element and the section container (as `Listen` in `packages/web/src/Player.ts` and `Leaf` in `packages/web/src/Pages.ts` already do), so they run as soon as the element is mounted.

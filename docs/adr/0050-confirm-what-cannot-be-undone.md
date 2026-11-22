# Confirm actions that cannot be undone, and answer reversible ones with a toast

## Decision

User actions in `packages/web` are divided by whether they can be taken back cheaply:

- **Five actions require confirmation:** realigning an open synced book, removing a kept copy, withdrawing a want, abandoning a grab and releasing a payload dispatch `RequestedConfirm` with a `ConfirmAction` (`packages/web/src/Model.ts`). `Main.ts` opens the shared `<dialog id="confirm-dialog">` (`confirmDialogView` in `packages/web/src/Ui.ts`) with focus placed on **Cancel** (`#confirm-cancel`), and only `ConfirmedAction` runs `executeConfirm`. Pressing `Escape`, clicking outside the dialog panel or navigating to another route cancels it. Retrying an unmade or failed book (`unmadeView` in `packages/web/src/Room.ts`) sends `ClickedRealign` directly without a dialog because there is no reading copy to lose.
- **Reversible actions run immediately and show a toast:** finishing, setting aside, keeping a copy, wanting a book, searching again, correcting a title, grabbing and resuming display a toast (`showToast` in `Ui.ts`) for 4.2 seconds (`TOAST_DURATION` in `Main.ts`), pausing the timer while hovered or focused. Finishing and setting aside close the room (`CloseRoom`) and show a shelf toast with an **Open again** link.

The toast is mounted once outside route views so it survives route transitions. Its text is announced through the single polite live region (`liveRegionView`) rather than a `role="status"` on the toast itself, avoiding duplicate announcements.

## Why

Previously, no action asked for confirmation: a single misclick could withdraw a want or evict hundreds of megabytes of cached audio from a phone. Confirming every action would create prompt fatigue, so confirmation is reserved for actions that discard work, delete a large local copy or affect state outside Prosody. Everything else is one click to reverse, which a toast with an **Open again** link covers cleanly.

Defaulting focus to **Cancel** ensures an accidental `Enter` never confirms a destructive action.

## What breaks if you change this

- Wiring a button for an open synced book's realignment, removing a kept copy, withdrawing a want, or abandoning or releasing a grab straight to `ClickedRealign`, `ClickedRemoveCopy`, `ClickedWithdraw` or `ClickedGrabMove` bypasses the confirmation dialog.
- Adding a confirmation dialog to finishing or setting aside adds friction to the normal way of leaving a book when the shelf toast already offers **Open again**.
- Opening the dialog with native `showModal()` instead of Foldkit's `Dom.showDialog` bypasses Foldkit's `inert` handling, Tab trap and `cancel` event. Because `Dom.showDialog` calls `dialog.show()`, native `::backdrop` is not rendered and the scrim must remain on `dialog.confirm-dialog[open]`.
- Adding `role="status"` back to `.toast` causes screen readers to announce every toast twice (once from the toast and once from `liveRegionView`).
- Rendering `toastView` inside a route view drops the toast whenever finishing or setting aside navigates back to the shelf.

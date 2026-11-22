# Send OpenBook once per visit and replace the URL when leaving via Finish or Set aside

## Decision

In `packages/web/src/Main.ts` and `packages/web/src/Rooms.ts`:

- `OpenBook` is sent only when a copy opens (`OpenedCopy`, or `reopen` after coming back online) and `room.hasOpened` is still `false`. Once `SucceededOpenBook` returns, `hasOpened` becomes `true` for the rest of the visit.
- Choosing **Mark as finished** (`ClickedFinish`) or **Set it aside** (`ClickedSetAside`) from the book menu sends `FinishBook` or `SetAside` and immediately runs `CloseRoom`, which calls `replaceUrl(shelfRouter())` rather than `pushUrl`.
- The shelf toast that follows includes an **Open again** link. Because it is a normal navigation link back to the room, following it starts a new visit and intentionally sends `OpenBook`.

## Why

`OpenBook` moves any work (including a finished or set-aside one) back onto the nightstand (`stage: "reading"`). Sending it once per visit avoids redundant commands on re-renders or reconnects, and replacing the room's URL with `/` on Finish or Set aside ensures that reloading the page or pressing the browser's Back button does not reopen the room and put the book straight back on the nightstand.

## What breaks if you change this

- Using `pushUrl` instead of `replaceUrl` in `CloseRoom` means pressing Back after finishing or setting a book aside reopens the room and immediately puts the book back on the nightstand.
- Sending `OpenBook` on every render or reconnect re-triggers nightstand updates after the reader has already opened the book.

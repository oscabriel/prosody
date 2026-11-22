---
title: Reading and listening
summary: Navigating the shelf, nightstand and reading room, and how your reading place stays in sync across devices.
order: 7
---

## The shelf

Prosody opens on **The shelf**, listing every book discovered in your library.

When you have books in progress, **On the nightstand** appears at the top of the shelf as a horizontal row of cards, ordered most recently read first. Each card displays the device and day it was last read, plus a check mark when kept on this device. Below it, **Every work** displays the full library as a cover grid or a compact list.

A toolbar above the library lets you narrow it down:

- **Search:** Filter by title or author (press `/` to focus the search box).
- **Sort:** `Recent`, `Author` (by surname) or `Title`.
- **Grid or list:** Switch layouts with the two buttons beside the sort control (or press `G` and `L`). The choice stays on that device.
- **Filters:** `All`, `Synced`, `Text`, `Audio`, `Pages`, `On this device`, `Finished`, and `Needs attention` whenever a book is still building or has failed.

While a search or filter is active, the nightstand hides so matching books appear immediately under the toolbar.

Each entry shows its cover, title and author, plus at most one status line:

- **Pairs (EPUB + M4B):** `Syncing…` while the press aligns them, `Not synced` if alignment failed (or `Not paired` before pairing starts). A synced pair shows a small format mark on its cover in grid view and a `Synced` badge in list view.
- **Single editions:** `Copying…` or `Not copied`. In list view, a badge labels the kind (`Text`, `Audio` or `Pages`).
- **Any book:** `Kept` when stored on this device, and `Finished` once marked finished.

## The reading room

Click a book on the shelf to open its reading room (books still `Syncing…` or `Copying…` cannot be opened yet; `Not synced` and `Not copied` books open to a retry button, with the underlying error under **Technical details**).

The book fills the viewport beneath a top bar:

- **Shelf** returns to the shelf.
- **Contents** opens the chapter list (hidden on PDFs with no outline headings).
- **Aa** (or **Page** in a PDF) opens display and appearance settings; audio alone shows the theme toggle instead.
- **···** opens the book menu for finishing, setting aside, keeping on the device, and (for an online synced book) **Synced**, which shows the press's sync note and the option to [align it again](/docs/syncing-a-book).

In books with text, the top bar slides out of view as you scroll down and returns when you scroll up, move the pointer to the top edge or press `Escape`.

### Synced books

A compact player stays docked at the bottom of the screen:

- **Play / Pause:** Starts or pauses playback at your current place (or press `Space`). While playing, the spoken sentence is highlighted and marked with a margin bar, and the page scrolls to keep it in view.
- **Scroll away:** Scrolling manually during playback pauses auto-following and reveals a **Back to playing** button. Click it (or press `F`) to jump back to the narrator.
- **Tap any sentence:** Moves your place and seeks the audio to that sentence.
- **Read silently:** Scroll and read without audio; your place follows the sentence you read to. Pressing play later resumes from there.
- **Skip and scrub:** Skip back 15 seconds or forward 30 seconds (`ArrowLeft` and `ArrowRight`), or drag the chapter scrubber. The dock shows elapsed chapter time and time remaining in the chapter at the current speed.
- **Speed:** Click the speed button to open a slider from `0.75×` to `2.5×` and six presets (`0.8×`, `1×`, `1.25×`, `1.5×`, `1.75×`, `2×`).
- **Full player:** Click the chapter name in the dock to expand the full player sheet with cover art, total time remaining in the book, previous and next chapter controls, and **Sleep** (pause after 15, 30, 45 or 60 minutes, or at the end of the chapter).
- **Contents:** Lists every section with its spoken duration so you can jump between chapters. Jumping to another chapter while paused shows **Back to \<chapter\>** so you can return to your place.
- **Appearance (Aa):** Choose theme (`Auto`, `Paper` or `Ink`), text size, line spacing, column width (on wider screens) and focus dimming while listening. These preferences stay on the device where you set them.

### Text alone

An EPUB without an audiobook opens in the same reading room without the player dock, showing `Section <n> of <m>` at the foot of the screen. Your place is tracked by sentence.

### Audio alone

An audiobook without an EPUB opens directly as a full player: cover art, chapter number and title, chapter scrubber with time remaining in the book, previous and next chapter, skip back 15 seconds and forward 30 seconds, and **Speed**, **Sleep**, **Contents** and **Keep** below. Your place is tracked by time.

### Printed pages

A PDF opens one page at a time, sized to fit the viewport:

- **Turn forward:** Tap the right quarter of the page, swipe left, press `ArrowRight` or `PageDown`, or click the next-page arrow in the page bar.
- **Turn back:** Tap the left quarter of the page, swipe right, press `ArrowLeft` or `PageUp`, or click the previous-page arrow in the page bar.
- **Show or hide controls:** Tap the middle half of the page.
- **Jump:** Drag the page scrubber, or click the page count below it (or press `G`) to jump to a page number.
- **Zoom:** Pinch to zoom in. While zoomed in, dragging pans the page instead of turning it.
- **Page display (Page):** Switch between fitting the whole page or its width. In the dark theme, you can also keep bright pages original, dim them or invert them.
- **Contents:** Shows the PDF's top-level outline headings when present.

Your place is saved as a page number once you stay on a page for a second.

## One place across devices

Your place in each book lives on your host, not on a single device. Stop listening on your phone and the book opens at the same sentence on your laptop.

- Reading and listening share one place in a synced book.
- If you start a book as **Audio alone** and later pair it with its EPUB, opening the synced book lands on the sentence spoken at your saved timestamp.
- If two devices report different places, the newer timestamp wins.
- If another device moves ahead while a book is already open in front of you, a banner at the top of the page shows `Further on <device>` with a **Jump there** button.

## Finishing and setting aside

Opening any book puts it on the nightstand. While online, the book menu (**···**) offers two actions:

- **Set it aside:** Removes the book from the nightstand without losing your place. Opening it again puts it back.
- **Mark as finished:** Marks the book finished and removes it from the nightstand while keeping your place.

Choosing either returns you to the shelf with a brief toast offering **Open again** in case it was accidental. Finished books show `Finished` on the shelf until opened again.

# Set book text and headings in EB Garamond, and the rest of the interface in the system sans-serif

## Decision

`packages/web/src/styles/tokens.css` defines two typefaces with distinct roles across every screen:

- `--font-serif` (`EB Garamond`, self-hosted variable WOFF2 files in `packages/web/src/fonts/`) is reserved for book prose (`.prose`, with `oldstyle-nums`), fallback cover monograms (`.cover-initial`), and headings: the `Prosody` wordmark, screen and section headings, sheet/popover/dialog titles, and book or chapter titles where they act as headings (`.book-card-title`, `.book-row-title`, `.nightstand-title`, `.room-bar-title`, `.audio-chapter`, `.desk-item-title`).
- `--font-ui` (the platform's system sans-serif stack) is set on `html` in `packages/web/src/styles/base.css` with `lining-nums tabular-nums`, so every other element inherits it: navigation, buttons, labels, filter chips, form inputs, authors, dates, file sizes, player clocks, table-of-contents rows, menus, toasts and badges.

Typefaces do not change by route, and the reading room offers no font picker.

## Why

The reader previously set everything in EB Garamond with small caps and oldstyle figures. That made buttons and labels read like prose, reduced scannability at small sizes, and caused clocks and byte counts to jitter as digits changed. Keeping EB Garamond for the book's own text and headings preserves Prosody's typographic character while giving controls and readouts a face built for small sizes and aligned figures.

Using the platform's system sans-serif stack adds no extra font download or licence and respects native text rendering and sizing.

## What breaks if you change this

- Setting controls, metadata or readouts in `--font-serif` reintroduces the scannability and figure-alignment problems this split fixes.
- Switching `.prose` to `--font-ui` or deleting `packages/web/src/fonts/` removes the typeface the reading room is designed around; `packages/site/src/style.css` also loads those font files.
- Removing `tabular-nums` from `html` causes player clocks, countdowns and desk file sizes to shift horizontally as numbers update.
- Replacing `html`'s `font-size: 100%` with a fixed pixel size stops the interface from scaling with the reader's browser text-size preference, because layout and type tokens are sized in `rem`.

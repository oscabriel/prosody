# Style every screen in one palette of paper and ink

## Decision

The shelf, reading rooms and desk share one set of design tokens in `packages/web/src/styles/tokens.css`, base and shell styles in `base.css` and `shell.css`, and shared component styles in `components.css`, all imported through `packages/web/src/style.css`. Per-screen stylesheets (`shelf.css`, `desk.css`, `room.css`) handle layout only.

- `--paper` (`#fafafa`) and `--ink` (`#2a2722`) anchor the palette; the dark theme swaps them.
- Neutral steps build around those two values: surfaces (`--surface`, `--surface-hover`, `--surface-raised`), softer inks (`--ink-soft`, `--ink-muted`), decorative dividers (`--rule`), and interactive borders (`--border-control`, `--border-strong`).
- Three semantic colours are reserved for status: `--danger`, `--warn` and `--ok`, each paired with a tinted `-surface` token for badges and banners. In the dark theme, `--danger` (`#f4a59b`) and `--ok` (`#8fd0a7`) are lighter so badges remain at least 4.5:1 against `--surface-raised`.
- Spoken sentences in paired books use a warm highlight wash (`--highlight-bg`, softened to `--highlight-bg-paused` when paused) and a 2 px margin bar (`--highlight-bar`).
- Dark tokens apply under `prefers-color-scheme: dark` unless `:root` carries `data-theme="light"`, and always when `:root` carries `data-theme="dark"` ([ADR 0051](0051-appearance-stays-on-the-device.md)).

Typeface roles are recorded separately in [ADR 0048](0048-garamond-for-books-sans-for-the-interface.md).

## Why

Previously, the reader and the desk looked like unrelated apps, and the reader used ink alone for every status, making failures, stalls and kept copies hard to distinguish at a glance. Sharing one warm paper-and-ink palette unifies all three screens, while reserving three muted semantic colours for status keeps the interface calm.

Every text token is verified to meet at least 4.5:1 contrast against every surface it sits on in both themes, and `--border-control` meets at least 3:1.

## What breaks if you change this

- Hardcoding a colour in a component stylesheet breaks dark-theme switching.
- Adjusting a text, badge or surface token without rechecking contrast can drop muted labels or dark-theme badges on `--surface-raised` below 4.5:1.
- Changing `--paper` or `--ink` without updating the `theme-color` `<meta>` tags in `packages/web/index.html`, `BAR` in `packages/web/src/Theme.ts` and the colours in `packages/web/public/manifest.webmanifest` leaves browser chrome mismatched against the page.
- Using `--danger`, `--warn` or `--ok` decoratively dilutes their meaning for errors, stalls and kept copies.

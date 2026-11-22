# Keep reading appearance on the device, not in the model

## Decision

Visual preferences stay local to each browser rather than syncing through the domain model. `Appearance` (`packages/web/src/Appearance.ts`) stores the theme (`auto`, `light` or `dark`), reading-room text size, line spacing, column width, focus dimming while listening, and pages fit and dark-mode brightness in `localStorage` under `prosody:appearance`. The shelf's grid or list layout (`ShelfLayout`) is stored under `prosody:shelf-view`.

- Both values are read at startup in `packages/web/src/entry.ts` and passed to the app as `Flags`. Changes dispatch `ChangedAppearance`, which applies the CSS properties and writes storage via `ApplyAppearance` (`packages/web/src/Ui.ts`).
- `packages/domain` has no command, event or view for appearance.
- Storage read or write failures fall back silently to defaults (`DEFAULT_APPEARANCE`, `DEFAULT_SHELF_LAYOUT`).
- To avoid a flash of the wrong theme on load, the `themeBoot` plugin in `packages/web/vite.config.ts` bundles `packages/web/src/ThemeBoot.ts` and inlines it into `<head>` so a forced theme is applied before the main app script runs.

Playback speed and the sleep timer have an even shorter lifetime: they live only in the active room's state for the current visit.

## Why

A reading place belongs to the book and should follow you across devices. Typography and theme do not: a text size tuned for a phone at night is wrong for a desktop monitor during the day, and switching to Ink on one device should not darken another. Storing appearance in the model would also block first paint behind authentication and a network round trip, breaking offline startup.

Keeping these preferences in `localStorage` avoids touching the model, server or press, and requires no schema migration: any stored value that fails to decode cleanly resets to defaults.

## What breaks if you change this

- Moving appearance into the model forces every device to share one theme and text size and delays first paint until a view subscription responds.
- Importing `effect` (or any large module) into `packages/web/src/Theme.ts` pulls it into the inlined `<head>` script and slows down initial paint.
- Renaming fields of `Appearance` without a fallback resets existing readers' stored preferences to `DEFAULT_APPEARANCE` because decoding fails.
- Reading `localStorage` directly without the `Effect.try` guard in `Appearance.ts` crashes startup in browsers or modes where storage is unavailable.

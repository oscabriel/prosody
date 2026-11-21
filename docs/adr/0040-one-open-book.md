# Style the reader as one open book of paper and ink, and the desk as a sans-serif tool

## Decision

The visual system in `packages/web/src/style.css` uses five colour tokens (`--paper`, `--ink`, `--ink-soft`, `--ink-faint`, `--rule`). In dark mode (`prefers-color-scheme: dark`), `--paper` and `--ink` swap and the muted tokens invert; nothing else changes.

The reader uses a two-column open-book layout (`.book`: a sticky `.leaf` on the left and the reading page on the right) in `EB Garamond` with `oldstyle-nums`, true small-caps labels (`all-small-caps`), and a manicule (`☞`) instead of colour to mark the current chapter.

The desk (`.desk`) reuses the same five tokens, drops `.leaf`, and switches to a system sans-serif face with `lining-nums`.

## Why

The reading room and shelf are meant to feel like a quiet printed book rather than a dashboard, so typography, spacing and traditional book marks (small caps, manicule, oldstyle figures) carry hierarchy instead of coloured badges. The desk is a utility for searching, comparing file sizes/seeders and managing grabs, where a single column, sans-serif type and lining figures are easier to scan.

## What breaks if you change this

- Introducing hardcoded colours or chromatic status badges breaks the five-token dark-mode inversion and the monochrome book aesthetic.
- Removing `all-small-caps` or the `EB Garamond` font files (`packages/web/src/fonts/`) degrades labels and body typography.
- Wrapping `.desk` in `.book`/`.leaf` or switching it to oldstyle numerals makes tabular release sizes and seeder counts harder to scan.

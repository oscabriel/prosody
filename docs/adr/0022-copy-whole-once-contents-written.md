# Treat a reading copy as complete only once contents.json is written

## Decision

Each work's reading copy lives in `/copies/<work>/` (`packages/press/src/ReadingCopies.ts`): unpacked `text/`, `audio/<file>`, `pictures/`, optional `cover.jpg`, and for pairs `timeline.json`, `<work>.epub` and `heard-<size>.emissions`. `contents.json` is always written last.

When a new alignment or copy starts, `freshFolder` empties `/copies/<work>/` except for the cached `heard-*.emissions` file.

`serveCopy` (`packages/server/src/Copies.ts`) mounts `/copies` read-only in `Api` and serves only `contents.json`, `timeline.json`, `cover.jpg`, `text/*`, `pictures/*` and `audio/*` (`SERVED`), keeping `<work>.epub` and `heard-*.emissions` private. Single byte-range requests (`Range: bytes=...`) are answered with HTTP `206` and `content-range`.

## Why

- Writing `contents.json` last makes its presence a reliable atomic marker that the copy is complete; a reader opening a work without `contents.json` treats it as unmade rather than reading half-written files.
- Emptying the folder on each try prevents stale sections, covers or pictures from an earlier edition from leaking into the new copy, while preserving `heard-*.emissions` avoids re-running the speech model.
- Restricting `SERVED` in `Copies.ts` avoids exposing internal cache files or the bundled EPUB archive over HTTP, and supporting single byte ranges matches what browser `<audio>` elements and the offline piece-fetcher send.

## What breaks if you change this

- Writing `contents.json` before all sections, pictures, cover and audio are in place lets clients fetch incomplete copies and cache broken state.
- Deleting `heard-*.emissions` in `freshFolder` forces the aligner to re-transcribe the full audiobook on every retry (note `docs/issues/0002-remaking-a-copy-empties-it.md` tracks the separate issue that emptying the folder breaks readers mid-remake).
- Widening `SERVED` or loosening the path traversal check (`part === "" || part === "." || part === ".."`) exposes private files or paths outside `/copies/<work>/`.

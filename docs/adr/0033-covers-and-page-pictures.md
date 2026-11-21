# Make covers best-effort JPEGs and render PDF pages as 1,600 px JPEGs

## Decision

- **Covers** (`packages/press/src/Covers.ts`, `packages/press/src/ReadingCopies.ts`): `Covers.make` writes one JPEG (`cover.jpg`) scaled to at most 800 px tall, chosen from the EPUB's cover image, else the audio's embedded artwork, else a PDF's first rendered page. Errors return `Option.none()` so a missing or broken cover never fails a copy.
- **PDF pages** (`packages/press/src/Pages.ts`): `Pages.draw` renders pages with `pdftoppm` at 1,600 px on the longer side as zero-padded JPEGs so plain string sorting keeps them in order. `Pages.headings` keeps only top-level (`depth === 1`) PDF outline entries and returns `[]` on error.

## Why

- A broken or missing cover image is cosmetic and should never block reading a book.
- Scaling covers to 800 px height and PDF pages to 1,600 px on the longer edge balances sharpness on phones and laptops against file size and offline cache storage.
- Relying on `pdftoppm`'s zero-padded names keeps page ordering simple with a plain string sort.
- Keeping only top-level PDF outline entries matches how the reading room's contents list displays chapter-level navigation without cluttering it with deep sub-sections.

## What breaks if you change this

- Letting `Covers.make` fail the enclosing `ReadingCopies.make` or `copy` causes books with malformed cover images or no artwork to fail completely.
- Changing `pdftoppm`'s naming or removing zero-padding breaks lexicographical sorting (`page-10.jpg` would sort before `page-2.jpg`).
- Rendering PDF pages at much higher resolution bloats `/copies/<work>/pictures/` and slows down both page turns and "Keep on this device".

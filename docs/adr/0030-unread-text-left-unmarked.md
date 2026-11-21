# Leave unread matter unmarked and preserve source bytes when wrapping sentences

## Decision

EPUB XHTML preparation follows two rules (`packages/aligner/src/Sections.ts`, `packages/aligner/src/Sentences.ts`):

1. **Skip unread matter and notes**: `isNarrated` skips non-narrated sections (cover, title page, copyright, contents, index, notes, bibliography, colophon) identified by `epub:type`, OPF `<guide>`, `<title>`, or filename in the first or last 15% of the spine. Inside narrated sections, `markIn` skips note containers, sections under `UNREAD_HEADING` ("References", "Footnotes", etc.) and inline note references.
2. **Wrap without shifting bytes**: `mark` keeps `decodeEntities: false`. Before sentence segmentation, `entitiesRead` and `blankedOf` replace HTML entities and note references with same-length stand-ins so slice offsets stay exact, and `sentenceRanges` refuses splits after abbreviations (`NOT_AN_END`) and single-letter initials (`INITIAL`).

## Why

- Narrators do not read copyright pages, tables of contents, indexes, bibliographies or footnote markers. Marking them inflates the sentence count with unalignable text and lowers every book's apparent sync coverage.
- Preserving raw HTML entities and matching their character lengths during segmentation keeps character offsets aligned with the DOM text nodes so wrapping each sentence in `<span id="...">` does not corrupt markup or shift slices across tags.

## What breaks if you change this

- Decoding entities before slicing or changing string length in `entitiesRead`/`blankedOf` shifts `from`/`to` offsets in `markRun`, splitting sentences mid-word or breaking XHTML entities.
- Marking front/back matter or reference lists drags down aligned-sentence ratios and adds dead unplayable spans.
- Removing the `NOT_AN_END` or `INITIAL` guards splits sentences at `"Dr."`, `"Mr."`, `"e.g."` or middle initials like `"J. R. R."`.

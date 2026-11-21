# Normalise book text into spoken words before aligning

## Decision

Before tokenising or matching ties, `spoken` (`packages/aligner/src/Spoken.ts`) converts book text into lower-case spoken English words:

- Decomposes Unicode (`NFKD`), strips diacritics, lower-cases, normalises curly apostrophes and turns dashes/slashes into spaces.
- Expands symbols (`&`, `%`, `+`, `=`, `@`, `#`) and currency amounts (`$5` -> `five dollars`, `£`, `€`).
- Expands abbreviations followed by a full stop (`Dr.` -> `doctor`, `Mr.` -> `mister`, `vs.` -> `versus`, `e.g.` -> `for example`, etc.).
- Converts numbers: cardinals (`20` -> `twenty`), ordinals (`21st` -> `twenty first`), 4-digit years between 1100 and 2099 (`1984` -> `nineteen eighty four`), decades (`1980s`, `80s`), clock times (`3:05` -> `three oh five`), decimals (`3.14` -> `three point one four`) and leading-zero digit strings.

When matching tie n-grams, `Anchors.ts` strips apostrophes (`keyOf = (word) => word.replaceAll("'", "")`).

## Why

Parakeet CTC emits lower-case words without digits or punctuation (`"twenty"`, `"nineteen eighty four"`, `"doctor"`). Comparing raw book text against the model's transcript would miss ties on every number, date, currency or title abbreviation, and apostrophe differences (`"don't"` vs `"dont"`, possessives) would break exact n-gram matches.

## What breaks if you change this

- Passing raw digits, currency symbols or abbreviations to `Acoustic.tokensOf` or `Anchors.candidatesOf` prevents those words from forming ties and lowers forced-alignment scores on passages with numbers, dates or dialogue titles.
- Removing apostrophe stripping in `Anchors.ts` drops valid ties whenever the book and the speech model disagree on a contraction or possessive.

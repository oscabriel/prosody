# Write every aligned pair's archive as a valid EPUB 3 with Media Overlays

## Decision

`writeReadingCopy` (`packages/aligner/src/Overlay.ts`) writes `<work>.epub` as a standards-compliant EPUB 3.0 package with SMIL 3.0 Media Overlays:

- `mimetype` is the first ZIP entry, stored uncompressed (`ZipPassThrough`), and audio tracks under `Audio/` are stored uncompressed.
- Each section with aligned sentences gets a `media-overlay` SMIL item; sections in different subfolders that share a basename get disambiguated overlay paths (`MediaOverlays/<name>-<n>.smil`).
- Each overlay's `media:duration` and the book's total `media:duration` are the sum of aligned `<par>` durations, formatted by `clock(seconds)` which rounds to whole milliseconds before splitting into hours, minutes and seconds.

## Why

Following EPUB 3 Media Overlays strictly means `<work>.epub` can be opened and played in any standards-compliant third-party reader (not only Prosody's web reading room), and passes EPUBCheck without structural errors. Rounding to whole milliseconds before formatting avoids clock rollover bugs such as `0:00:60.000`.

## What breaks if you change this

- Compressing `mimetype` or writing it after other entries invalidates the EPUB container specification.
- Formatting `seconds % 60` before rounding to milliseconds can emit invalid SMIL clock values like `0:01:60.000`.
- Dropping overlay filename disambiguation causes one section's `.smil` file to overwrite another's in multi-folder EPUBs.
- Setting total `media:duration` to the raw audio file length instead of the sum of overlay durations fails EPUB 3 Media Overlays validation whenever unread audio (intros, pauses, credits) exists.

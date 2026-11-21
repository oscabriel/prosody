# Play a real, aligner-generated public-domain sync on the site's front page

## Decision

The landing page's interactive reading-room demo (`packages/site/src/Passage.ts`, `packages/site/src/Room.ts`) plays the opening paragraph of *Moby-Dick* using public-domain sources: Project Gutenberg's text and Stewart Wills's LibriVox recording (`packages/site/public/demo/loomings.m4a`, `LENGTH = 77.9` seconds).

The sentence start and end timestamps in `PASSAGE` (`packages/site/src/Passage.ts`) were produced by Prosody's own aligner (`packages/aligner/bench/run.ts`, run on the first seven minutes of the recording, minus 28.7 seconds trimmed from the start of the audio). Any change to the demo passage must be re-aligned with the aligner, replacing both `PASSAGE` and `packages/site/public/demo/loomings.m4a` together, never hand-tweaked.

## Why

Showing a screen recording of the reading room would expose a private library of copyrighted books. Playing an actual aligner output on a public-domain book avoids copyright and privacy issues while serving as live proof that Prosody's aligner produces accurate sentence-level sync.

## What breaks if you change this

- Hand-editing timestamps in `packages/site/src/Passage.ts` turns the front-page demo into a faked mock instead of real aligner output.
- Replacing `packages/site/public/demo/loomings.m4a` with a differently trimmed audio file without updating `PASSAGE` shifts every sentence highlight out of sync with the audio.
- Using a copyrighted book or a private library screenshot on the public site introduces copyright and privacy problems.

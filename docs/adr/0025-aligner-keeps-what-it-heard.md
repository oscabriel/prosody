# Cache sparse CTC emissions beside the reading copy and run one thread per physical core

## Decision

`Acoustic` (`packages/aligner/src/Acoustic.ts`) runs `onnx-community/parakeet-ctc-0.6b-ONNX` (`int8`) over 30-second windows with 2 seconds of context either side, scoring 1,024 SentencePiece tokens plus blank every 80 ms:

- **Sparse cache**: Each frame keeps only its top `KEPT = 16` non-blank tokens, the blank score, and 10 ms loudness. `Emissions.ts` writes this beside the reading copy as `heard-<size>.emissions` (`packages/press/src/ReadingCopies.ts`), keyed by the audio file's byte size, and `Aligner.ts` reuses it on retries if its track lengths match the probed audio.
- **Lazy loading**: Both `Acoustic` and `SpotCheck` load their ONNX models lazily on first use (`Effect.cached`).
- **One thread per physical core**: `PROSODY_ALIGNER_THREADS` defaults to physical cores parsed from `/proc/cpuinfo` (`coresOf`), not logical processors.

## Why

- Dense log-probabilities for all 1,025 classes across a 20-hour book would take ~3.7 GB; keeping the top 16 tokens plus blank is all CTC forced alignment needs and fits beside the copy so re-alignment never listens again.
- Lazy loading means a broken or missing model fails one alignment (`ListenFailed`) instead of crashing `Press` and stopping walks or shelving.
- On an 8-core machine, ONNX Runtime spins on hyperthreads: 8 threads ran at ~30x real time versus ~24x at 16 threads, and held 20x versus 11.5x under competing CPU load.

## What breaks if you change this

- Dropping `heard-<size>.emissions` or changing its naming forces every `RealignNarration` try to re-run Parakeet over the entire audiobook.
- Loading ONNX models eagerly at service startup crashes `Press` on boot if `/models` is missing or incompatible.
- Defaulting `intraOpNumThreads` to logical processors instead of physical cores slows down listening and degrades throughput sharply under load.
- Changing the `PRSE` binary layout in `Emissions.ts` without handling old files invalidates existing `heard-*.emissions` caches on disk (though `Aligner.ts` will fall back to re-listening if decoding throws).

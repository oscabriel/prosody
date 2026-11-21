# Bake ffmpeg, poppler and pinned speech models into the press image

## Decision

`packages/press/image/Dockerfile` installs `ffmpeg`, `poppler-utils` and `@huggingface/transformers@4.3.2`, and downloads both ONNX speech models into `/models` at pinned Hugging Face commit revisions:

- `onnx-community/parakeet-ctc-0.6b-ONNX` at `7df2cab7aed886b8b7f80d68a8214007e4847601` (`model_int8.onnx` and `model_int8.onnx_data`)
- `onnx-community/whisper-base.en` at `51eefc0af78b103839eda9e7e4f4186acc6517fe` (`encoder_model.onnx` and `decoder_model_merged.onnx`)

`Press` (`packages/press/src/Press.ts`) sets `PROSODY_ALIGNER_MODELS: "/models"` and excludes `@huggingface/transformers` from its bundle (`build: { input: { external: ["@huggingface/transformers"] } }`) so it loads the copy installed in `/app`.

The image creates a `press` user with `--uid "$PRESS_UID"` (from `PROSODY_UID`, default `1000`) and runs as `USER press`.

## Why

- Baking models into the image at pinned revisions lets alignment run completely offline and prevents upstream model updates from silently changing alignment accuracy.
- `@huggingface/transformers` depends on `onnxruntime-node`'s native binary, which cannot be bundled cleanly into a single JS file; installing it in the image and marking it external keeps native loading working.
- Matching the container UID to the host owner of `PROSODY_LIBRARY` and `PROSODY_COPIES` ensures files written by the press have the right ownership on the host.

## What breaks if you change this

- Removing `@huggingface/transformers` from `external` breaks `onnxruntime-node` native module loading at runtime.
- Unpinning the Hugging Face revisions or fetching models at runtime makes `Press` depend on internet access during alignment and risks silent regressions if weights change.
- Running `Press` as root or a mismatched UID creates files in `/library` and `/copies` that the host user cannot manage (or fails with permission errors on mounted shares).

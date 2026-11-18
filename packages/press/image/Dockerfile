# The press's base: Bun, ffmpeg, the aligner's speech models and the library that runs them.
# Alchemy builds the press on top of it. Bump the tag in Press.ts whenever this file changes.
FROM debian:trixie-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
	&& rm -rf /var/lib/apt/lists/*

COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun

# The models, as transformers.js keeps them in its cache, at the revisions the aligner was tested
# with: Parakeet CTC 0.6B (int8) aligns, Whisper base.en checks.
ARG HF=https://huggingface.co
RUN set -e; \
	get() { mkdir -p "/models/$1/$(dirname "$3")"; curl -fsSL -o "/models/$1/$3" "$HF/$1/resolve/$2/$3"; }; \
	p=onnx-community/parakeet-ctc-0.6b-ONNX; r=7df2cab7aed886b8b7f80d68a8214007e4847601; \
	for f in config.json preprocessor_config.json tokenizer.json tokenizer_config.json \
		onnx/model_int8.onnx onnx/model_int8.onnx_data; do get "$p" "$r" "$f"; done; \
	w=onnx-community/whisper-base.en; r=51eefc0af78b103839eda9e7e4f4186acc6517fe; \
	for f in config.json generation_config.json preprocessor_config.json tokenizer.json tokenizer_config.json \
		onnx/encoder_model.onnx onnx/decoder_model_merged.onnx; do get "$w" "$r" "$f"; done

# The press runs as uid 1000, the host's own user, so the reading copies it writes are yours.
RUN useradd --uid 1000 --create-home press && install -d -o press /app
USER press

# The library that runs the models loads a native library, so it is installed here rather than
# bundled into the press. The press's bundle lands in /app beside it.
WORKDIR /app
RUN bun add @huggingface/transformers@4.3.2

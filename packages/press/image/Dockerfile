FROM debian:trixie-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg poppler-utils ca-certificates curl \
	&& rm -rf /var/lib/apt/lists/*

COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun

ARG HF=https://huggingface.co
RUN set -e; \
	get() { mkdir -p "/models/$1/$(dirname "$3")"; curl -fsSL -o "/models/$1/$3" "$HF/$1/resolve/$2/$3"; }; \
	p=onnx-community/parakeet-ctc-0.6b-ONNX; r=7df2cab7aed886b8b7f80d68a8214007e4847601; \
	for f in config.json preprocessor_config.json tokenizer.json tokenizer_config.json \
		onnx/model_int8.onnx onnx/model_int8.onnx_data; do get "$p" "$r" "$f"; done; \
	w=onnx-community/whisper-base.en; r=51eefc0af78b103839eda9e7e4f4186acc6517fe; \
	for f in config.json generation_config.json preprocessor_config.json tokenizer.json tokenizer_config.json \
		onnx/encoder_model.onnx onnx/decoder_model_merged.onnx; do get "$w" "$r" "$f"; done

ARG PRESS_UID=1000
RUN useradd --uid "$PRESS_UID" --create-home press && install -d -o press /app
USER press

WORKDIR /app
RUN bun add @huggingface/transformers@4.3.2

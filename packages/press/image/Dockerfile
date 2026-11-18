# The press's base: Node for Storyteller's aligner, ffmpeg for audio, and Bun for the press itself.
# Alchemy builds the press on top of it. Bump the tag in Press.ts whenever this file changes.
FROM node:24-trixie-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg libgomp1 unzip ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

RUN npm install -g @storyteller-platform/align@0.2.16

COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun

# The press runs as uid 1000, the host's own user, so the reading copies it writes are yours.
USER node

# The models the aligner would otherwise download on its first run: the CTC model it aligns with,
# and whisper.cpp with base.en for the spot check.
RUN ghost=$(find /usr/local/lib/node_modules -path '*/ghost-story/dist/cli/bin.js' | head -n 1) \
	&& node "$ghost" install ctc-model quartznet15x5 --language en --device cpu \
	&& node "$ghost" install binary \
	&& node "$ghost" install model base.en

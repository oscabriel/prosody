# Trigger service redeploys with content fingerprints

## Decision

Each service uses a fingerprint or explicit tag so Alchemy knows when a container must be replaced:

- **`Api` and `Press` code**: Both pass `PROSODY_SOURCE: yield* sourceFingerprint` in their container `environment` (`packages/server/src/Api.ts`, `packages/press/src/Press.ts`). `sourceFingerprint` (`packages/server/src/Source.ts`) is the first 16 hex characters of the SHA-256 hash of all files under `packages/domain/src`, `packages/server/src`, `packages/press/src` and `packages/aligner/src`.
- **`Api` base image**: `PageImage` (`packages/server/src/Page.ts`) tags its image `page-<hash>` using `fingerprintOf(["packages/web/dist", "packages/web/Dockerfile"])`.
- **`Press` base image**: `PressImage` (`packages/press/src/Press.ts`) uses a manually bumped tag constant (`IMAGE = "pages-1"`), suffixed with `-uid<uid>` when `PROSODY_UID` is not `"1000"`.

## Why

- Alchemy does not always detect changes inside bundled TypeScript service code alone (see `docs/issues/0003-source-fingerprint-workaround.md`), so changing `PROSODY_SOURCE` forces a service update whenever any shared source file changes.
- Tagging `PageImage` by the hash of `packages/web/dist` and `packages/web/Dockerfile` automatically rolls `Api` whenever the web build or Dockerfile changes.
- Building `packages/press/image/Dockerfile` downloads large ONNX models and installs packages, so its tag is bumped by hand rather than hashed on every deploy, with a per-UID suffix so different hosts do not collide on the default `1000` image.

## What breaks if you change this

- Removing `PROSODY_SOURCE` causes `pnpm run deploy` to skip restarting `Api` or `Press` after code changes in `packages/domain`, `packages/server`, `packages/press` or `packages/aligner`.
- Modifying `packages/press/image/Dockerfile` without bumping `IMAGE` in `packages/press/src/Press.ts` reuses the old cached image instead of rebuilding it.
- Changing `packages/web` without running `pnpm --filter @prosody/web build` leaves `packages/web/dist` stale, so `PageImage`'s hash does not change.

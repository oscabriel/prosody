# `PROSODY_SOURCE` works around Alchemy missing code-only changes

**Where:** `sourceFingerprint` in `packages/server/src/Source.ts`, `Api` in `packages/server/src/Api.ts`, and `Press` in `packages/press/src/Press.ts`

## What is wrong

In Alchemy `2.0.0-beta.87`, a `Docker.Service` whose settings depend on other resources (such as Docker networks) is not redeployed when only its bundled TypeScript source changes. To force a redeploy, `sourceFingerprint` hashes every file under `packages/domain/src`, `packages/server/src`, `packages/press/src`, and `packages/aligner/src`, and both `Api` and `Press` pass that hash as the `PROSODY_SOURCE` environment variable.

## What it costs

- Any new service must wire `PROSODY_SOURCE: yield* sourceFingerprint` into its environment or code-only changes will silently fail to deploy.
- Because one fingerprint covers all four packages, a change in `packages/press/src` redeploys `Api` and a change in `packages/server/src` redeploys `Press`.

## How to fix

After upgrading Alchemy, verify whether a code-only change to `Api` and `Press` triggers a redeploy without `PROSODY_SOURCE`. Once Alchemy detects bundled source changes on its own, remove `PROSODY_SOURCE` from `packages/server/src/Api.ts` and `packages/press/src/Press.ts`, and delete `sourceFingerprint` from `packages/server/src/Source.ts` (keep `fingerprintOf`, which `packages/server/src/Page.ts` still uses).

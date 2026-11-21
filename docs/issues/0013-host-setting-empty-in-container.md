# Required host settings read as empty inside a container

**Where:** `onHost` in `packages/server/src/Host.ts` (currently affects `libraryOnHost` for `PROSODY_LIBRARY`, the only host setting without a default)

## What is wrong

Alchemy evaluates a `Docker.Service`'s settings callback both at plan time on the host (where `.env` is loaded) and again inside the container at startup (where `.env` is not present). Because `PROSODY_LIBRARY` has no `otherwise` default, `onHost` checks `if ((yield* ALCHEMY_PHASE) === "runtime") { return ""; }` so the container does not die on startup.

## What it costs

A missing required host setting stops a plan as intended, but inside a container it silently resolves to `""`. Currently nothing inside the container reads `libraryOnHost` at runtime (the volume mount is already wired at deploy time), but any future runtime code that yields a required `onHost` setting will silently get `""` instead of failing fast.

## How to fix

Keep `onHost` strictly in plan-time code so it is never evaluated inside a container, or pass resolved host settings into container environment variables when runtime code needs them, then remove the `ALCHEMY_PHASE === "runtime"` fallback in `packages/server/src/Host.ts`.

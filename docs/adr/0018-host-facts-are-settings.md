# Read host-specific facts from environment settings at deploy plan time

## Decision

Host paths, UID and relay address (`PROSODY_LIBRARY`, `PROSODY_DOWNLOADS`, `PROSODY_COPIES`, `PROSODY_UID`, `PROSODY_RELAY`) are read from `.env` through `packages/server/src/Host.ts`. A missing required setting stops `plan` or `deploy` with the variable's name.

Inside a running container (`ALCHEMY_PHASE === "runtime"`), `.env` is absent, so `Host.ts` returns `""` for unset required settings (see `docs/issues/0013-host-setting-empty-in-container.md`) and `packages/server/src/Source.ts` returns `"none"` when `packages/domain/src` does not exist.

Because Alchemy binds `Config` reads to whichever resource is being declared:

- `Runners` (`packages/server/src/ProsodyLive.ts`) reads `ProwlarrSettings` and `QBittorrentSettings` on the pool declaration, and `Press` (`packages/press/src/Press.ts`) reads `QBittorrentSettings` at the top of its service setup.
- Background loops that touch container-only paths or services run inside `host.run(...)`, because Alchemy also evaluates service setup on the host during planning.

## Why

Keeping all host-specific paths, addresses and UIDs in `.env` (documented in `.env.example` and `docs/hosting.md`) keeps the public repository free of real machine names and paths. Guarding runtime-only work with `ALCHEMY_PHASE` and `host.run` avoids crashing either during `alchemy plan` on the host or at container startup.

## What breaks if you change this

- Hardcoding a host path, UID or address in source breaks other hosts and violates the public-repository rule.
- Removing the `ALCHEMY_PHASE === "runtime"` branch in `Host.ts` crashes containers on boot when Alchemy re-evaluates service definitions without `.env`.
- Reading `ProwlarrSettings` or `QBittorrentSettings` lazily inside a handler instead of during pool/service declaration prevents Alchemy from injecting those environment variables into the containers.
- Starting background fibres outside `host.run(...)` executes them on the host machine during `pnpm run plan` or `pnpm run deploy`.

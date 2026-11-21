# Route external traffic only through the loopback relay, and block forwarded calls to /press

## Decision

`Api` (`packages/server/src/Api.ts`) publishes no host port. Instead, `alchemy.run.ts` runs a small `caddy:2-alpine` container (`Relay`) attached to the stack's `Front` network, listening only on `PROSODY_RELAY` (default `127.0.0.1:3023`) and proxying to `http://prosody-api:3000` (`API_ALIAS` in `packages/server/src/Front.ts`).

The host's Caddy reverse proxy sends browser traffic to `Relay`. `Press` (`packages/press/src/Press.ts`) calls `http://prosody-api:3000/press` directly over the `Front` Docker network without passing through a proxy.

In `Api.ts`, any request to `/press` that carries an `x-forwarded-for` header is answered with HTTP `404`.

## Why

- The host's Caddy runs with host networking and cannot join a Docker Swarm overlay network directly.
- Publishing a port on a Docker Swarm service binds every host interface by default, which would expose the Api outside loopback. A plain container (`Relay`) can bind strictly to `127.0.0.1`.
- Because `Relay` and the host's Caddy always add `x-forwarded-for`, rejecting `/press` requests that contain `x-forwarded-for` ensures only containers on the internal `Front` network can invoke `PressApi` commands without tailnet auth.

## What breaks if you change this

- Publishing a port directly on `Api` exposes `/api`, `/copies` and `/press` on all network interfaces of the host, bypassing Caddy and `/auth`.
- Removing the `x-forwarded-for` check on `/press` allows any browser reaching the host's Caddy to send unauthenticated `PressApi` commands.
- Removing `Relay` without another loopback-only bridge leaves the host's Caddy unable to reach the Swarm service.

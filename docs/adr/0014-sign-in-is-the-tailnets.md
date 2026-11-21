# Authenticate every request through the host's tailnet

## Decision

Prosody has no user accounts or passwords. Caddy forwards every request to `/auth` (`packages/server/src/Session.ts`) with the peer address in `x-prosody-peer`.

`/auth` calls `Tailscale.admit` (`packages/server/src/Tailscale.ts`) over `/var/run/tailscale/tailscaled.sock`:

- An untagged node owned by the host's tailnet user is admitted with HTTP `200` and `x-prosody-device: <ComputedName>`.
- Any other peer (outside the tailnet, tagged, or owned by another user) gets HTTP `403` with the fixed body `"Prosody admits only your own devices."`; the reason is logged only on the server.
- Admissions and refusals from `tailscaled` are cached for `KEEP_FOR = "30 seconds"`. Socket errors when `tailscaled` does not answer are never cached.
- A request with an empty `x-prosody-peer` and `early-data: 1` gets HTTP `425` (`"Too early"`).

## Why

- Delegating identity to Tailscale removes password and session management while giving every device a stable name (`ComputedName`).
- Rejecting tagged nodes prevents shared or automated infrastructure nodes on the tailnet from accessing personal reading state or triggering grabs.
- Caching answers for 30 seconds avoids hitting `tailscaled` repeatedly during a single page load of many assets, while refusing to cache socket failures lets recovery take effect immediately when `tailscaled` comes back.
- Returning `425` on TLS 0-RTT early data prevents admitting a request whose peer address cannot yet be trusted.
- Returning a generic `403` body avoids leaking tailnet topology or ownership details to callers.

## What breaks if you change this

- Admitting tagged nodes grants Prosody access to server or CI nodes on the tailnet.
- Caching `tailscaled` connection errors locks out all devices for 30 seconds after `tailscaled` restarts.
- Removing the `425` check on `early-data: 1` or letting `/auth` accept requests without `x-prosody-peer` weakens the authentication boundary.

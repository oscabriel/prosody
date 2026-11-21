---
title: Signing in
summary: How Prosody uses Caddy and Tailscale to admit your own devices without accounts or passwords.
order: 4
---

Prosody has no user accounts and no login form. Instead, it relies on Tailscale to verify which device made each request.

## How a request is checked

1. Your browser connects to Caddy over your tailnet.
2. Caddy sends a `forward_auth` subrequest to Prosody's `/auth` endpoint with the client's IP address in `X-Prosody-Peer`.
3. Prosody asks the host's Tailscale daemon (`tailscaled.sock`) which node owns that address.
4. If the node is an untagged machine owned by the same Tailscale user as the host, Prosody returns `200` with the machine's Tailscale name in `X-Prosody-Device`. Otherwise it returns `403`.
5. Caddy copies `X-Prosody-Device` onto the proxied request and forwards it to the app.

That device name is what appears under **On the nightstand** beside `Last read on <device>, <date>`.

## Caddy configuration

Run Caddy directly on the host (or with host networking) so it can reach the relay on loopback:

```
prosody.example.com {
	forward_auth 127.0.0.1:3023 {
		uri /auth
		header_up X-Prosody-Peer {remote_host}
		copy_headers X-Prosody-Device
	}
	reverse_proxy 127.0.0.1:3023
}
```

If you changed `PROSODY_RELAY` in `.env`, replace `127.0.0.1:3023` with your value.

- `X-Prosody-Peer` tells Prosody which client address to look up in Tailscale.
- `copy_headers X-Prosody-Device` overwrites any header a browser might have sent. Requests without it are rejected.
- Do not expose the relay on a second hostname or port that bypasses `forward_auth`, as anything reaching it directly could forge `X-Prosody-Device`.

## DNS and TLS

Point `prosody.example.com` at the host's Tailscale IP address, not its LAN IP. Requests arriving over a local network come from non-tailnet addresses and are refused.

Because the hostname only needs to resolve inside your tailnet, a DNS-01 challenge lets Caddy obtain a TLS certificate without opening any ports to the public internet.

## Who is admitted

Prosody admits requests that meet both conditions:

- The device belongs to the same Tailscale user as the host.
- The device has no Tailscale tags.

Tagged nodes, devices shared from another tailnet and cross-site subrequests are refused. If you want to change who is admitted, `docs/hosting.md` in the repository points to the file that implements the rule.

## Common refusal responses

| What you see | Cause and fix |
|---|---|
| `403` `"Prosody admits only your own devices."` | The request did not come from an untagged tailnet device owned by the host's user. Check that `prosody.example.com` resolves to the host's Tailscale IP (not its LAN IP) and that the client device is untagged. |
| `401` `"Signed out"` | The request reached the Api without `X-Prosody-Device`, meaning Caddy's `forward_auth` block was bypassed or misconfigured. |
| Refusals right after restarting Tailscale on the host | Brief and expected. The Api container checks `/var/run/tailscale/tailscaled.sock` every 10 seconds and Docker swarm replaces it automatically once the socket changes. |

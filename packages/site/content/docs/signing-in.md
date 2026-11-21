---
title: Signing in
summary: There are no accounts. Being on your tailnet, on a device you own, is the sign-in.
order: 4
---

## How it works

1. A device asks Caddy for a page.
2. Caddy asks Prosody about the request, passing on the address it came from.
3. Prosody asks the host's Tailscale whose machine that address is.
4. If it is an untagged machine of the host's owner, the request goes through, carrying the machine's name. Anything else is refused.

So a device is known by its name in your tailnet, and that name is what the shelf shows beside "last read on". There is nothing to register and no password to set.

## The Caddy block

Run Caddy on the host itself, or with host networking: it must reach the host's loopback address.

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

- `X-Prosody-Peer` carries the address the request came from.
- `copy_headers X-Prosody-Device` puts the device's name on the request, replacing anything a browser sent. Prosody refuses a request without it.
- Give the app no second name that skips `forward_auth`. A browser could then claim to be any device.

## The name

`prosody.example.com` must resolve to the host's tailnet address, the one Tailscale gave it. A request that reaches Caddy over your home network comes from an address the tailnet does not know, and is refused.

The name needs a certificate. For a name that only resolves inside your tailnet, a DNS challenge works: Caddy proves it controls the domain through your DNS provider, with no port open to the internet.

## Who is let in

- Machines in your tailnet that belong to the host's owner.
- Not tagged machines, and not machines shared in from another tailnet.

If you want to let someone else read, that is a change to the source: `docs/hosting.md` in the repository names the file that decides who is admitted.

## When it refuses

| What you see | Why |
|---|---|
| 403 on every page | The request did not come from a tailnet address you own. Check the name resolves to the host's tailnet address, and that the device is yours and untagged. |
| 401 "Signed out" | The request reached the app without passing through Caddy's `forward_auth`. |
| It worked, then stopped after Tailscale restarted | Expected, and brief: the Api is replaced so it can reach Tailscale again. |

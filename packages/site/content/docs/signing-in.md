---
title: Signing in
summary: How Prosody handles reader accounts, OpenID Connect single sign-on, admin roles and Caddy reverse proxying.
order: 4
---

Prosody supports multiple readers sharing one library. Every reader has their own reading places, nightstand and signed-in devices, while admins can also use the desk, realign books, remake reading copies and invite or manage readers.

You can sign in with an OpenID Connect (OIDC) provider, with built-in local accounts, or with both side by side.

## Caddy configuration

Run Caddy directly on the host (or with host networking) so it can reach the relay on loopback:

```
prosody.example.com {
	reverse_proxy 127.0.0.1:3023
}
```

If you changed `PROSODY_RELAY` in `.env`, replace `127.0.0.1:3023` with your value. The relay trusts private-range proxy headers so `X-Forwarded-Proto` and `X-Forwarded-For` reach the Api, and setting `PROSODY_PUBLIC_URL=https://prosody.example.com` in `.env` pins the canonical public origin for `Secure` cookies and OIDC callbacks.

Because Prosody handles its own accounts and sessions, it works over your LAN, over a tailnet or anywhere Caddy serves it over HTTPS. A DNS-01 challenge still lets Caddy obtain a TLS certificate for a private hostname without opening ports to the public internet.

## Signing in with OpenID Connect

Any standard OIDC provider supporting Authorization Code + PKCE (such as Pocket ID, Authelia or Authentik) works with Prosody.

1. Register an OIDC client in your provider with the callback URL:

   ```text
   https://prosody.example.com/auth/oidc/callback
   ```

2. Add the client settings to `.env` and redeploy:

   ```sh
   PROSODY_PUBLIC_URL=https://prosody.example.com
   OIDC_ISSUER_URL=https://id.example.com
   OIDC_CLIENT_ID=<your-client-id>
   OIDC_CLIENT_SECRET=<your-client-secret>
   OIDC_DISPLAY_NAME=Pocket ID
   OIDC_ADMIN_GROUP=admins
   ```

   Leave `OIDC_CLIENT_SECRET` blank if you register a public PKCE client. If your Api container cannot reach `OIDC_ISSUER_URL` directly because of split-horizon DNS, set `OIDC_INTERNAL_URL` to the address reachable from inside Docker while keeping `OIDC_ISSUER_URL` as the public issuer.

3. Open Prosody and click **Sign in with Pocket ID** (or whatever label you set in `OIDC_DISPLAY_NAME`).

Anyone who can authenticate with your OIDC provider gets a reader account automatically on their first sign-in. Members of `OIDC_ADMIN_GROUP` (default `admins`) receive the `admin` role, and the very first user on a fresh install is also made an admin so an OIDC-only host cannot lock itself out. Set `PROSODY_LOCAL_AUTH=false` if you want OIDC to be the only way in.

## Built-in local accounts and invites

When `PROSODY_LOCAL_AUTH` is enabled (the default), Prosody needs no external identity provider:

1. On a fresh install with no accounts yet, opening Prosody takes you to `/setup` to create the first admin account.
2. Once signed in, open **Account** in the top bar to rename your current device, review or sign out other devices, create single-use 7-day invite links (`/invite/<token>`) and manage reader roles.
3. Passwords are hashed with `scrypt`, verified in constant time and protected by a per-username rate limit.

## Sessions and devices

Each browser or app sign-in creates a 90-day sliding session stored in Postgres (only the SHA-256 hash of the session token is kept). Browsers use an `HttpOnly; SameSite=Lax` cookie paired with cross-site request checks, and every endpoint also accepts `Authorization: Bearer` tokens for native clients.

Each session starts with a friendly device name parsed from the browser's `User-Agent` (such as `Safari on iPhone`), which you can rename on the **Account** screen. That name is what appears under **On the nightstand** and in reading-room notices when you have read further on another device.

## Common refusal responses

| What you see | Cause and fix |
|---|---|
| Redirected back to `/login?error=sso` | Single sign-on failed. Check the Api logs (`docker service logs`) for `"single sign-on failed"`: verify the callback URL (`<PROSODY_PUBLIC_URL>/auth/oidc/callback`), client secret and that the Api container can reach `OIDC_ISSUER_URL`. |
| `403` `"Prosody refuses requests from other sites"` | A mutating request arrived with a mismatched `Origin` or cross-site `Sec-Fetch-Site` header. |
| `401` `"Signed out"` | Your session expired or was signed out from another device. Sign in again at `/login`. |

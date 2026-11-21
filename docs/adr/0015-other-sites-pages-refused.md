# Refuse cross-site requests from other web pages in /auth

## Decision

Before admitting a device, `/auth` (`packages/server/src/Session.ts`) checks `isCrossSite(request.headers)` and refuses with HTTP `403` if either condition holds:

- `Origin` is present and its parsed host does not equal the `Host` header.
- `Sec-Fetch-Site` is `"cross-site"` or `"same-site"`, unless the request is a top-level document navigation (`Sec-Fetch-Mode === "navigate"` and `Sec-Fetch-Dest === "document"`).

## Why

Tailscale vouches for which machine sent a request, not which web page in the browser initiated it. Because authentication is ambient (based on peer IP rather than a secret token), any other website open in a browser on one of your devices could otherwise send requests to Prosody and read your library, move your place, or grab releases. Blocking `same-site` as well as `cross-site` also protects Prosody from sibling subdomains under `example.com`, while allowing top-level navigations so links to Prosody still open normally.

## What breaks if you change this

- Removing or weakening `isCrossSite` exposes every Api endpoint (including `/api` commands and `/copies`) to cross-site request forgery from any website visited on a tailnet device.
- Blocking top-level `navigate` + `document` requests breaks clicking links to Prosody from bookmarks, mail clients or other pages on `example.com`.

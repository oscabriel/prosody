# Refuse cross-site requests from other web pages

## Decision

Every cookie-authenticated request to `/api`, `/copies/` and mutating `/auth/*` routes (`packages/server/src/Session.ts`, `packages/server/src/AuthRoutes.ts`) checks `isCrossSite(request.headers)` and refuses it (with `403` on `/auth/*`, or by treating cookie credentials as absent on `/api` and `/copies/`) if either condition holds:

- `Origin` is present and its parsed host does not equal the `Host` header.
- `Sec-Fetch-Site` is `"cross-site"` or `"same-site"`, unless the request is a top-level document navigation (`Sec-Fetch-Mode === "navigate"` and `Sec-Fetch-Dest === "document"`).

Requests carrying an explicit `Authorization: Bearer <token>` header are exempt because browsers never attach bearer headers ambiently.

## Why

Cookies (like tailnet peer IPs before [ADR 0053](0053-readers-sessions-and-single-sign-on.md)) are sent ambiently by the browser. Blocking `same-site` as well as `cross-site` subrequests protects Prosody from sibling subdomains under `example.com` as well as external sites, while allowing top-level navigations so links and OIDC callbacks still open normally.

## What breaks if you change this

- Removing or weakening `isCrossSite` exposes `/api` commands, `/copies/` and mutating `/auth/*` endpoints to cross-site request forgery from sibling subdomains or other sites.
- Blocking top-level `navigate` + `document` requests breaks clicking links to Prosody from bookmarks, mail clients or OIDC redirects.

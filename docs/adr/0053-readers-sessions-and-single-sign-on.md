# Identify readers with accounts, sessions and OpenID Connect

## Decision

Prosody replaces tailnet-only device authentication ([ADR 0014](0014-sign-in-is-the-tailnets.md)) with multi-user accounts and database-backed sessions, supporting OpenID Connect (OIDC) as a first-class sign-in method alongside built-in local accounts:

- **Accounts and roles:** Each person is a **reader** (`ReaderId`, `u-<hex>` in `packages/domain/src/Reader.id.ts`) with a role of `"admin"` or `"reader"`. Every signed-in reader shares the library shelf and reading copies, while keeping their own `Reading` aggregate (`ReadingId` `<readerId>:<workId>`), `Place` view and `Nightstand` view (keyed by `ReaderId`). Only admins may read `Wanted`, use the desk, trigger `RealignNarration` or `RemakeCopy`, or manage invites and readers.
- **Actor in the domain:** `Session` middleware (`packages/domain/src/Session.middleware.ts`) provides `Actor` (`{ reader, role, device }` in `packages/domain/src/Actor.context.ts`) instead of `Device`. Every guarded aggregate `decide` handler and view validator enforces `asAdmin` or `asReader` before any state check or no-op, returning `Forbidden` (HTTP `403`). Even admins cannot read or write another reader's `Reading`, `Place` or `Nightstand`.
- **Sessions in Postgres:** `AuthStore` (`packages/server/src/AuthStore.ts`) stores `prosody_users`, `prosody_sessions`, `prosody_invites` and `prosody_oidc_states` in the existing cluster Postgres database (`PROSODY_DATABASE_URL`), connecting lazily on first use so `pnpm run plan` on the host never tries to reach Postgres. Opaque 32-byte session tokens are stored only as SHA-256 hashes and slide forward over a 90-day lifetime.
- **Cookies and bearer tokens:** Browsers authenticate with an `HttpOnly; SameSite=Lax` cookie (`prosody_session`, marked `Secure` over HTTPS) paired with `isCrossSite` CSRF checks ([ADR 0015](0015-other-sites-pages-refused.md)). Every endpoint also accepts `Authorization: Bearer <token>` (and `mode: "bearer"` on local sign-in endpoints) for native clients.
- **First-class OIDC:** `OidcClient` (`packages/server/src/Oidc.ts`) implements Authorization Code + PKCE (`S256`), single-use `state` bound to a short-lived cookie, `nonce` checking, and Web Crypto JWKS verification (`RS256`, `PS256`, `ES256`, `ES384`) with zero third-party OIDC dependencies. New OIDC readers are provisioned automatically on first sign-in; membership in `OIDC_ADMIN_GROUP` grants `"admin"` (and the very first user on a fresh install is made `"admin"` so an OIDC-only host cannot lock itself out).
- **Local accounts:** When `PROSODY_LOCAL_AUTH` is enabled (the default), an empty instance prompts for first-run admin setup (`/setup`), admins can issue single-use 7-day invite links (`/invite/<token>`), and passwords are hashed with `scrypt` (`N=16384, r=8, p=5`) and checked in constant time with a bounded atomic per-username rate limiter.

## Why

- Tying sign-in to a single owner's Tailscale peer IP blocked access on local home networks when DNS resolved to a LAN address, prevented sharing a household library with family or friends, and gave every device the same reading places and nightstand.
- Checking `Actor` inside domain `decide` handlers and view validators keeps every authorization rule pure, typed and verifiable in domain stories without a live server.
- Storing auth tables in the cluster's existing Postgres avoids adding another database container while keeping session revocation immediate across devices.
- Supporting both OIDC and local accounts lets homelab operators connect an existing identity provider (such as Pocket ID) without forcing casual self-hosters to deploy one.

## What breaks if you change this

- Weakening `asReader` or `asAdmin` checks in `decide` or view validators allows readers to see or overwrite another reader's place, or non-admins to trigger desk searches and realignment.
- Dropping the `prosody_oidc_state` cookie check reopens OIDC login CSRF; removing `isCrossSite` reopens cookie CSRF on `/auth/*`, `/api` and `/copies/`.
- Connecting to Postgres eagerly inside `Api`'s module setup breaks `pnpm run plan` on the host, because Alchemy evaluates service definitions outside the cluster network.
- Reverting `Relay` to strip `X-Forwarded-Proto` leaves cookies without `Secure` and OIDC callback URLs on `http://` whenever `PROSODY_PUBLIC_URL` is unset.

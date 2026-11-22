# Hosting Prosody

This guide walks through deploying Prosody on a Linux host with Docker and Caddy. Everything specific to your machine is a setting in `.env`; anything else Prosody assumes is listed in [Where each assumption lives](#where-each-assumption-lives) with the file to change.

Throughout this guide, the machine running Prosody is called "the host", and examples use `prosody.example.com` as its address.

## What you need

| Requirement | Details |
|---|---|
| Linux host with Docker in swarm mode | The stack runs four Docker swarm services (Postgres, the model's runner, the Api and the press) plus one plain Docker container (the relay). Run `docker swarm init` once; a single node is enough. |
| Caddy on the host | Caddy terminates TLS and proxies traffic to the relay on loopback. Run it directly on the host or in a container with host networking so it can reach `127.0.0.1`. |
| A hostname for the app | `prosody.example.com` with a TLS certificate Caddy can serve (a DNS challenge works for a private name on your LAN or tailnet). |
| OpenID Connect provider (optional) | Any OIDC provider supporting Authorization Code + PKCE (such as Pocket ID, Authelia or Authentik) works for single sign-on. Without one, Prosody's built-in local accounts and invite links work on their own. |
| A library folder | One root folder containing `ebooks/` and `audiobooks/`. It can live on a local disk or a network share. |
| A reading copies folder | Must live on a local disk. A synced pair stores both a copied `.m4b` and an EPUB with embedded audio, so budget roughly twice the audiobook's size per synced work. |
| Node `>=26.11.0`, pnpm `12.21.0`, Bun | Needed to run checks, build the web app and deploy via Alchemy. `corepack enable` provides the pinned pnpm version. |
| Fetching books at the desk (optional) | Admins can also use the desk to fetch wanted books; see [`acquiring/README.md`](acquiring/README.md). Reading and alignment work without it. |

## 1. Organise the library

The press walks one root folder (`PROSODY_LIBRARY`) laid out by edition kind, author and title:

```text
<PROSODY_LIBRARY>/
  ebooks/<Author>/<Title>/<any name>.epub
  ebooks/<Author>/<Title>/<any name>.pdf
  audiobooks/<Author>/<Title>/<any name>.m4b
```

- A work's shelfmark is `<Author>/<Title>`. Matching `<Author>/<Title>` folders under `ebooks/` and `audiobooks/` form a pair, which the press aligns.
- A work with only one edition still opens in the reading room: its `.epub` (text), `.pdf` (pages) or `.m4b` (audio). If a work has both an `.epub` and a `.pdf` with no audio, the `.epub` is used.
- Audio must be a single `.m4b` file per work. Before aligning a pair, the aligner checks the stream codec and rejects anything other than AAC-LC (or MP3 inside `.m4b`), as well as files `ffmpeg` cannot decode to their full stated duration.
- The press is the only part that writes to `PROSODY_LIBRARY`, and it only ever adds files when shelving a book fetched from the desk, named `<Title> - <Author>.<ext>`.

## 2. Configure `.env`

Copy `.env.example` to `.env` at the repository root and fill it in. Git ignores `.env`.

| Setting | Default | Purpose |
|---|---|---|
| `PROSODY_LIBRARY` | required | Path to the library on the host. Mounted writable into the press. |
| `PROSODY_COPIES` | `/srv/prosody/copies` | Path for reading copies on a local disk. Mounted writable into the press and read-only into the Api. |
| `PROSODY_UID` | `1000` | Numeric user ID the press runs as (`id -u`). Must have write access to `PROSODY_LIBRARY` and `PROSODY_COPIES`. |
| `PROSODY_RELAY` | `127.0.0.1:3023` | Loopback address and port the relay container binds on the host. Keep it on loopback. |
| `PROSODY_PUBLIC_URL` | unset (from proxy headers) | Canonical public origin (`https://prosody.example.com`, no trailing slash). Recommended in production for OIDC callback URLs and `Secure` cookies. |
| `PROSODY_LOCAL_AUTH` | `true` | Enables built-in local password sign-in, first-run setup and invite registration. Set to `false` for OIDC-only hosts. |
| `OIDC_ISSUER_URL` | unset | OpenID Connect issuer URL (`https://id.example.com`). Set together with `OIDC_CLIENT_ID` to enable single sign-on. |
| `OIDC_INTERNAL_URL` | unset | Optional backchannel origin override for discovery, JWKS, token and userinfo calls from inside the Api container. |
| `OIDC_CLIENT_ID` | unset | OIDC client ID registered with your identity provider. Callback URL is `<PROSODY_PUBLIC_URL>/auth/oidc/callback`. |
| `OIDC_CLIENT_SECRET` | unset | OIDC client secret for confidential clients (leave unset for public PKCE clients). |
| `OIDC_DISPLAY_NAME` | `Single sign-on` | Label shown on the OIDC sign-in button. |
| `OIDC_ADMIN_GROUP` | `admins` | Group name in the OIDC `groups` claim that grants the `admin` role. |
| `OIDC_SCOPES` | `openid profile email groups` | Space-separated OIDC scopes requested during sign-in. |

`.env.example` also lists optional settings for fetching books at the desk (covered in [`acquiring/README.md`](acquiring/README.md)) and `PROSODY_SITE_DOMAIN` (only used when deploying the public site in `packages/site`). Leave them unset if you do not need them.

## 3. Prepare the host

Run these steps once before the first deploy:

1. Initialise Docker swarm mode:

   ```sh
   docker swarm init
   ```

2. Create the reading copies folder owned by the press's user:

   ```sh
   sudo install -d -o "$USER" /srv/prosody/copies
   ```

   Without `sudo`, point `PROSODY_COPIES` at a folder your user already owns.

3. Check that the library is reachable: `ls "$PROSODY_LIBRARY"` should list `ebooks` and `audiobooks`.

## 4. Deploy the stack

From the repository root:

```sh
pnpm install
pnpm check
pnpm run deploy --yes
```

Notes on deploying and operating the stack:

- Use `pnpm run deploy`, not `pnpm deploy` (which is a different, built-in pnpm command). Both `pnpm run plan` and `pnpm run deploy` build `@prosody/web` first and then invoke Alchemy with `bunx --bun alchemy`.
- `pnpm run plan` builds the web app and shows what a deploy would change without modifying the running stack.
- The first deploy builds the press's Docker image (`packages/press/image/Dockerfile`, 3.15 GB), installing `ffmpeg`, `poppler-utils` and `@huggingface/transformers`, and downloading both pinned speech models (`onnx-community/parakeet-ctc-0.6b-ONNX` and `onnx-community/whisper-base.en`) into `/models`. Later deploys reuse that image unless the Dockerfile, `IMAGE` in `packages/press/src/Press.ts` or `PROSODY_UID` changes.
- Alignment runs on the CPU. By default, Parakeet uses one thread per physical core (overridable with `PROSODY_ALIGNER_THREADS`), and the Whisper spot check uses 4 threads.
- Keep `.alchemy/` while the stack is up. It holds Alchemy's local state, which `pnpm run destroy` reads to take the stack down.
- Alchemy names the stage `live_<user>` from `$USER`. To run a second stack alongside it, set `ALCHEMY_STAGE` and give it its own `PROSODY_COPIES` and `PROSODY_RELAY`.
- The press walks `PROSODY_LIBRARY` on startup and every 5 minutes after. Use `docker service logs` on the press service to watch each walk and alignment.

## 5. Configure Caddy

The relay container listens only on `PROSODY_RELAY` (`127.0.0.1:3023` by default), trusts `private_ranges` so `X-Forwarded-Proto` and `X-Forwarded-For` pass through, and forwards to the Api on the stack's overlay network. Put Caddy in front of it:

```caddyfile
prosody.example.com {
	reverse_proxy 127.0.0.1:3023
}
```

Reload Caddy, then open `https://prosody.example.com` in a browser:

- If OIDC is configured, click the single sign-on button to sign in with your identity provider. Anyone in your provider can read; members of `OIDC_ADMIN_GROUP` (and the very first user on a fresh install) receive the `admin` role.
- If using built-in local accounts, complete the one-time admin setup at `/setup`, then create invite links from **Account** for anyone else you want to admit.
- On a phone, add the page to the home screen to install it.

## Where each assumption lives

For anything not covered by `.env`, change the source directly. Each assumption lives in one place:

| Assumption | Where | To change it |
|---|---|---|
| Library layout and file extensions | `HALVES` and `EXTENSIONS` in `packages/press/src/Stacks.ts`; the `"ebooks"` and `"audiobooks"` folder names in `packages/press/src/ReadingCopies.ts` | Rename the folders, add extensions or change the walk layout. |
| Sign-in, sessions and OIDC | `packages/server/src/AuthRoutes.ts`, `AuthStore.ts`, `Oidc.ts` and `Session.ts` | Change session lifetime, password rules, rate limits, cookie options or OIDC claim mapping. |
| Role permissions in the model | `asAdmin` and `asReader` in `packages/domain/src/Session.middleware.ts`, each aggregate's `decide` and each view's validator | Change which commands or views require `admin` versus any signed-in `reader`. |
| Fetching books at the desk | [`acquiring/README.md`](acquiring/README.md) | Lists its own settings and source files. |
| External metadata (Open Library, Audible and Audnexus) | Port `packages/domain/src/Library/Metadata.external.ts` and adapter `packages/server/src/OpenLibraryMetadata.ts` | Write another adapter for the `Metadata` port and provide it in `packages/server/src/ProsodyLive.ts`. |
| Speech models | `packages/press/image/Dockerfile`, `MODEL` in `packages/aligner/src/Acoustic.ts` and `CHECK_MODEL` in `packages/aligner/src/SpotCheck.ts` | Swap the model, then bump `IMAGE` in `packages/press/src/Press.ts` so the press image rebuilds. |
| Single runner, single Postgres, swarm topology | `Database` and `Runners` in `packages/server/src/ProsodyLive.ts`, and `alchemy.run.ts` | Adjust replicas or declare different resources there. |
| Dev server port (`3022`) | `packages/web/vite.config.ts` | Change `port` in `server`. |

After editing the source, run `pnpm check` and inspect the planned changes with `pnpm run plan`.

## When something is wrong

| Symptom | Cause and what to check |
|---|---|
| `pnpm run plan` or `pnpm run deploy` stops with `PROSODY_LIBRARY is not set. Copy .env.example to .env and fill it in.` | `.env` is missing at the repository root, or `PROSODY_LIBRARY` is unset or empty. |
| OIDC sign-in redirects back to `/login?error=sso` | Check the Api service logs (`docker service logs`) for `"single sign-on failed"`. Common causes are a mismatched callback URL (`<PROSODY_PUBLIC_URL>/auth/oidc/callback`), wrong `OIDC_CLIENT_SECRET`, or the Api container being unable to reach `OIDC_ISSUER_URL` (set `OIDC_INTERNAL_URL` if split-horizon DNS blocks container egress). |
| `403` `"Prosody refuses requests from other sites"` | A mutating request arrived with a mismatched `Origin` or cross-site `Sec-Fetch-Site` header. |
| `401` (`Signed out` on `/copies/`, or `SignedOut` on `/api`) | Your session expired or was signed out from another device. Sign in again at `/login`. |
| The shelf is empty | The press could not read `PROSODY_LIBRARY`, or its folders do not match `<ebooks\|audiobooks>/<Author>/<Title>/`. Check the press service logs: each `walked the library` entry lists unreadable folders. |
| A work never aligns | Alignment requires both an `.epub` and an `.m4b` (AAC-LC or MP3) under the same `<Author>/<Title>`. Check the press service logs for `not aligned` and its `reason`. |

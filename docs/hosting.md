# Hosting Prosody

This guide walks through deploying Prosody on a Linux host with Docker, Tailscale and Caddy. Everything specific to your machine is a setting in `.env`; anything else Prosody assumes is listed in [Where each assumption lives](#where-each-assumption-lives) with the file to change.

Throughout this guide, the machine running Prosody is called "the host", and examples use `prosody.example.com` as its address.

## What you need

| Requirement | Details |
|---|---|
| Linux host with Docker in swarm mode | The stack runs four Docker swarm services (Postgres, the model's runner, the Api and the press) plus one plain Docker container (the relay). Run `docker swarm init` once; a single node is enough. |
| Tailscale on the host | Sign-in queries the host's `tailscaled` socket to identify incoming peers. The host must be an untagged machine owned by your Tailscale user. |
| Tailscale on every device | Only untagged machines belonging to the host's Tailscale user are admitted. |
| Caddy on the host | Caddy terminates TLS, checks `/auth` on every request via `forward_auth`, and proxies traffic to the relay on loopback. Run it directly on the host or in a container with host networking so it can reach `127.0.0.1`. |
| A hostname for the app | `prosody.example.com` must resolve to the host's tailnet IP, with a certificate Caddy can serve (a DNS challenge works for a private name). |
| A library folder | One root folder containing `ebooks/` and `audiobooks/`. It can live on a local disk or a network share. |
| A reading copies folder | Must live on a local disk. A synced pair stores both a copied `.m4b` and an EPUB with embedded audio, so budget roughly twice the audiobook's size per synced work. |
| Node `>=26.11.0`, pnpm `12.21.0`, Bun | Needed to run checks, build the web app and deploy via Alchemy. `corepack enable` provides the pinned pnpm version. |
| Fetching books at the desk (optional) | The desk can also fetch books you want; see [`acquiring/README.md`](acquiring/README.md). Reading and alignment work without it. |

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

The relay container listens only on `PROSODY_RELAY` (`127.0.0.1:3023` by default) and forwards to the Api on the stack's overlay network. Put Caddy in front of it with `forward_auth`:

```caddyfile
prosody.example.com {
	forward_auth 127.0.0.1:3023 {
		uri /auth
		header_up X-Prosody-Peer {remote_host}
		copy_headers X-Prosody-Device
	}
	reverse_proxy 127.0.0.1:3023
}
```

- `header_up X-Prosody-Peer {remote_host}` sends the client's IP to `/auth`. The Api queries `tailscaled` and, if the peer is an untagged machine owned by the host's user and the request is not cross-site, responds `200` with `X-Prosody-Device` set to the machine's Tailscale name.
- `copy_headers X-Prosody-Device` replaces any `X-Prosody-Device` header the browser sent with the one from `/auth`. Requests to `/api` and `/copies/` without `X-Prosody-Device` are refused with `401`.
- Do not expose the relay on any other hostname or route that skips `forward_auth`, or a browser could supply its own `X-Prosody-Device` header.
- Make sure `prosody.example.com` resolves to the host's tailnet IP. A request arriving over a LAN address is unknown to `tailscaled` and is refused with `403`.

Reload Caddy, then open `https://prosody.example.com` from a device in your tailnet. On a phone, add the page to the home screen to install it.

## Where each assumption lives

For anything not covered by `.env`, change the source directly. Each assumption lives in one place:

| Assumption | Where | To change it |
|---|---|---|
| Library layout and file extensions | `HALVES` and `EXTENSIONS` in `packages/press/src/Stacks.ts`; the `"ebooks"` and `"audiobooks"` folder names in `packages/press/src/ReadingCopies.ts` | Rename the folders, add extensions or change the walk layout. |
| Sign-in by Tailscale | `admission` in `packages/server/src/Tailscale.ts` and `authFetch` (`/auth`) in `packages/server/src/Session.ts` | Keep the Caddy contract (`X-Prosody-Peer` in, `X-Prosody-Device` out) and resolve identity from another source. |
| `tailscaled` socket directory (`/var/run/tailscale`) | `TAILSCALE` in `packages/server/src/Tailscale.ts` | Point it at the directory holding `tailscaled.sock`. |
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
| `403` (`Prosody admits only your own devices.`) on every request | Either the request did not arrive over Tailscale from an untagged machine owned by the host's user, `tailscaled` did not answer, or the request was flagged as cross-site. Confirm `prosody.example.com` resolves to the host's tailnet IP and check the Api logs for the `refused` reason. |
| `401` (`Signed out` on `/copies/`, or `SignedOut` on `/api`) | The request reached the relay without passing through Caddy's `forward_auth` block, so `X-Prosody-Device` was missing. |
| The shelf is empty | The press could not read `PROSODY_LIBRARY`, or its folders do not match `<ebooks\|audiobooks>/<Author>/<Title>/`. Check the press service logs: each `walked the library` entry lists unreadable folders. |
| A work never aligns | Alignment requires both an `.epub` and an `.m4b` (AAC-LC or MP3) under the same `<Author>/<Title>`. Check the press service logs for `not aligned` and its `reason`. |
| The Api restarts after Tailscale restarts | Expected behaviour. When `tailscaled` restarts it recreates `/var/run/tailscale`, breaking the Api container's bind mount. The Api's healthcheck (`test -S /var/run/tailscale/tailscaled.sock`) fails and Docker swarm replaces the task with a fresh mount. |

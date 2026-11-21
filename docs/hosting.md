# Hosting Prosody

This is the guide for putting Prosody on your own machine. Everything about a host is a setting in `.env`; everything else it assumes is listed in [Where each assumption lives](#where-each-assumption-lives), with the file to change.

The examples write your domain as `example.com` and the app's name as `prosody.example.com`.

## What you need

| Thing | Why |
|---|---|
| A Linux host with Docker | The stack is Docker swarm services: Postgres, a runner for the model, the Api, the press and a relay. |
| Swarm mode | Run `docker swarm init` once. One node is enough. |
| Tailscale on the host | Sign-in asks the host's `tailscaled` who each request is from. The host must be your own machine in the tailnet, not a tagged one. |
| Tailscale on each device | Only untagged machines of the host's owner are let in. |
| Caddy on the host | It asks the Api about every request, then passes it on. It must reach the host's loopback address, so run it on the host or with host networking. |
| A name for the app | `prosody.example.com` must resolve to the host's tailnet address, with a certificate Caddy can serve (a DNS challenge works for a private name). |
| A library | `ebooks/` and `audiobooks/` in one folder, laid out as below. It may be a network share. |
| A folder for reading copies | On a local disk. A synced book takes about twice the size of its audiobook. |
| Services to fetch books (optional) | The desk can fetch a book you want through services you already run; [`acquiring/`](acquiring/README.md) covers them. Reading works without them. |
| Node 26.11+, pnpm 12, Bun | To check and deploy. `corepack enable` gives you the right pnpm. |

The press's image is about 3 GB: it holds ffmpeg, poppler and two speech models, downloaded once as it is built. Aligning runs on the CPU, with a thread for every core.

## The library

The press walks one folder, `PROSODY_LIBRARY`, shaped like this:

```
<library>/
  ebooks/<Author>/<Title>/<any name>.epub      and, or instead, a .pdf
  audiobooks/<Author>/<Title>/<any name>.m4b
```

- A book is its author's folder and its title's folder. The same two names under `ebooks` and `audiobooks` make a pair, which is aligned.
- The audio is one `.m4b` a book, in AAC-LC. Check the codec of anything else before you trust its alignment.
- A book with one edition opens too: an EPUB to read, an audiobook to hear, a PDF a page at a time.
- The press is the library's one writer, and it only ever adds a file: a book the desk fetched, copied in as `<Title> - <Author>.<ext>`.

## Settings

Copy `.env.example` to `.env` at the repository's root and fill it in. Git ignores `.env`.

| Setting | Needed | What it is |
|---|---|---|
| `PROSODY_LIBRARY` | yes | The library on the host. Mounted writable into the press. |
| `PROSODY_COPIES` | no, `/srv/prosody/copies` | The reading copies, on a local disk. |
| `PROSODY_UID` | no, `1000` | The user the press runs as. It must be able to write the library and the copies folder (`id -u`). |
| `PROSODY_RELAY` | no, `127.0.0.1:3023` | Where the relay listens. Keep it on a loopback address. |

The desk's fetching has settings of its own, listed in `.env.example` and explained in [`acquiring/`](acquiring/README.md). Leave them out if you fetch nothing.

## Before the first deploy

1. Turn on swarm mode: `docker swarm init`.
2. Make the copies folder, owned by the press's user:

   ```sh
   sudo install -d -o "$USER" /srv/prosody/copies
   ```

   Without sudo, set `PROSODY_COPIES` to a folder you own.
3. Check the library answers: `ls "$PROSODY_LIBRARY"` shows `ebooks` and `audiobooks`.

## Deploy

```sh
pnpm install
pnpm check
pnpm run deploy --yes
```

- `pnpm run deploy` builds the web app, then deploys. `pnpm deploy` is a different, built-in pnpm command.
- `pnpm run plan` shows what a deploy would change, and changes nothing.
- The first deploy builds the press's image and takes several minutes. Later ones take under a minute.
- `.alchemy/` is the record of what is deployed. Keep it while the stack is up; `pnpm run destroy` reads it to take the stack down.
- The stage is named for you, `live_<user>`. Set `ALCHEMY_STAGE` for a second stack beside it, with its own `PROSODY_COPIES` and `PROSODY_RELAY`.

The press walks the library as it starts and every five minutes after. `docker service logs` on the press service shows each walk, and each book as it is aligned.

## Caddy

The relay listens on the host's loopback address alone. Caddy is the only way in from outside, and it asks the Api's `/auth` about every request first:

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

- `X-Prosody-Peer` is the address the request came from. The Api asks `tailscaled` whose machine that is, and answers with its name.
- `copy_headers X-Prosody-Device` puts that name on the request, replacing anything a browser sent. The Api refuses a request without it.
- Give the relay no second host name that skips `forward_auth`: a browser could then name any device.
- The name must resolve to the host's tailnet address. A request that reaches Caddy over the LAN comes from an address the tailnet does not know, and is refused with 403.

Then open `https://prosody.example.com` on a device in your tailnet. On a phone, add it to the home screen to install it.

## Where each assumption lives

For what a setting does not cover, change the source. Each of these is one place.

| Assumption | Where | To change it |
|---|---|---|
| Library layout and file types | `HALVES` and `EXTENSIONS` in `packages/press/src/Stacks.ts`; the same folder names in `packages/press/src/ReadingCopies.ts` | Rename the two halves, or teach the walk another layout. |
| Sign-in by Tailscale | `packages/server/src/Tailscale.ts` (`admission` decides who is let in) and `packages/server/src/Session.ts` (`/auth`) | Keep the contract with Caddy (`X-Prosody-Peer` in, `X-Prosody-Device` out) and answer it from another source of identity. |
| `tailscaled`'s socket in `/var/run/tailscale` | `TAILSCALE` in `packages/server/src/Tailscale.ts` | Point it at your socket's folder. |
| How the desk fetches a book | [`acquiring/`](acquiring/README.md) | It lists its own assumptions. |
| Metadata from Open Library and Audnexus | The port `packages/domain/src/Library/Metadata.external.ts`, the adapter `packages/server/src/OpenLibraryMetadata.ts` | Write another adapter. |
| Speech models | `packages/press/image/Dockerfile` and `packages/aligner/src` | Change the model, then bump `IMAGE` in `packages/press/src/Press.ts`. |
| One runner, one Postgres, on swarm | `packages/server/src/ProsodyLive.ts` and `alchemy.run.ts` | Declare other resources there. |
| The dev server's port, 3022 | `packages/web/vite.config.ts` | Change the port. |

After any change, `pnpm check` must pass, and `pnpm run plan` shows what the deploy will do.

## When something is wrong

| What you see | Why |
|---|---|
| The plan stops with `PROSODY_LIBRARY is not set` | `.env` is missing, or lacks that line. |
| 403 on every page | The request did not come from a tailnet address the host's owner owns. Check the name resolves to the host's tailnet address, and the device is yours and untagged. |
| 401 "Signed out" | The request reached the relay without going through Caddy's `forward_auth`. |
| The shelf is empty | The press could not read the library, or it is not laid out by author and title. The press's log names each folder it could not read. |
| A book never aligns | It needs both an `.epub` and an `.m4b` under the same author and title. The press's log says why a pair failed. |
| The Api restarts after Tailscale does | Expected: `tailscaled` makes its socket's folder anew, and swarm replaces the Api to mount it. |

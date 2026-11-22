---
title: Installing
summary: Step-by-step instructions to clone, configure and deploy Prosody on a Linux host.
order: 3
---

This guide assumes your host meets the requirements in [What you need](/docs/what-you-need). Run every command on the host.

## 1. Clone and install dependencies

```sh
git clone https://github.com/oscabriel/prosody.git
cd prosody
corepack enable
pnpm install
```

## 2. Enable Docker swarm mode

Prosody deploys its services onto Docker swarm. On a single machine, initialise it once:

```sh
docker swarm init
```

## 3. Create the reading copies folder

The press stores reading copies on a local disk, separate from your library:

```sh
sudo install -d -o "$USER" /srv/prosody/copies
```

If you prefer a different location, create any directory owned by the user that will run the press and set `PROSODY_COPIES` in the next step.

## 4. Configure `.env`

Copy the example file and fill in your host's paths:

```sh
cp .env.example .env
```

| Setting | Required | Default | Purpose |
|---|---|---|---|
| `PROSODY_LIBRARY` | Yes | None | Root folder containing `ebooks/` and `audiobooks/`. |
| `PROSODY_COPIES` | No | `/srv/prosody/copies` | Local folder where the press writes reading copies. |
| `PROSODY_UID` | No | `1000` | Numeric user ID the press runs as (`id -u`). Must be able to write to `PROSODY_LIBRARY` and `PROSODY_COPIES`. |
| `PROSODY_RELAY` | No | `127.0.0.1:3023` | Host address and port for the relay. Keep this on loopback so Caddy is the only way in. |

`.env` is ignored by git, so your local paths stay off the repository.

Optional settings for fetching books through the desk are listed in `.env.example` and documented in `docs/acquiring/README.md` in the repository. Leave them commented out if you only want to read books already in your library.

## 5. Run checks and deploy

```sh
pnpm check
pnpm run deploy --yes
```

A few things to know about deploying:

- **First build time.** The first deploy builds the press image and downloads both speech models, which takes several minutes. Subsequent deploys are much faster.
- **Preview changes first.** Run `pnpm run plan` to see what a deploy will change without applying it.
- **Use `pnpm run deploy`.** Plain `pnpm deploy` is a different, built-in pnpm command.
- **Keep `.alchemy/`.** Alchemy records deployed resources in `.alchemy/` inside the repository. Do not delete that folder while the stack is running.

## 6. Put Caddy in front

After deploying, Prosody listens only on `PROSODY_RELAY` (`127.0.0.1:3023` by default). Follow [Signing in](/docs/signing-in) to put Caddy in front and set up your first account or connect an OpenID Connect provider.

## Next steps

- Arrange your files according to [Adding books](/docs/adding-books).
- Open Prosody in a browser. The press walks your library on startup and every five minutes after, populating the shelf automatically.
- Any book with both an EPUB and an audiobook begins [syncing](/docs/syncing-a-book) on its own.

## Adapting to a different setup

Host-specific paths and addresses live in `.env`. If you need to change something that is not a setting, such as the library layout or the sign-in mechanism, see `docs/hosting.md` in the repository for the exact file behind each assumption.

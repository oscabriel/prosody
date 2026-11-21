---
title: Installing
summary: From a clone of the repository to a running app, one step at a time.
order: 3
---

This page assumes the host has what [What you need](/docs/what-you-need) lists. Every command runs on the host.

## 1. Get the code

```sh
git clone https://github.com/oscabriel/prosody.git
cd prosody
corepack enable
pnpm install
```

## 2. Turn on swarm mode

Prosody's services are Docker swarm services. One node is enough, and this is run once:

```sh
docker swarm init
```

## 3. Make a folder for the reading copies

The press makes a reading copy of each book, and keeps them on a local disk:

```sh
sudo install -d -o "$USER" /srv/prosody/copies
```

Without sudo, make a folder you own anywhere, and name it in the next step.

## 4. Say where your books are

Copy the example settings, and fill them in:

```sh
cp .env.example .env
```

| Setting | Needed | What it is |
|---|---|---|
| `PROSODY_LIBRARY` | yes | Your library: the folder that holds `ebooks/` and `audiobooks/`. |
| `PROSODY_COPIES` | no, `/srv/prosody/copies` | The folder from step 3. |
| `PROSODY_UID` | no, `1000` | The user the press runs as. It must be able to write the library and the copies folder. `id -u` prints yours. |
| `PROSODY_RELAY` | no, `127.0.0.1:3023` | Where the app listens on the host. Keep it on a loopback address. |

Git ignores `.env`, so your paths stay on your machine.

## 5. Check, then deploy

```sh
pnpm check
pnpm run deploy --yes
```

- The first deploy builds the press's image, speech models and all, and takes several minutes. Later ones take under a minute.
- `pnpm run plan` shows what a deploy would change, and changes nothing.
- `pnpm run deploy` is not `pnpm deploy`, which is a different command built into pnpm.
- `.alchemy/` in the repository is the record of what is deployed. Keep it for as long as the stack is up.

## 6. Put Caddy in front

The app now listens on the host's loopback address, where nothing outside can reach it. [Signing in](/docs/signing-in) gives it a name and lets your devices in.

## Now what?

- [Add books](/docs/adding-books), if your library is not yet laid out by author and title.
- Open the app. The shelf fills as the press walks your library, which it does as it starts and every five minutes after.
- A book with both an EPUB and an audiobook starts [syncing](/docs/syncing-a-book) on its own.

## If your machine differs

Everything about a host is a setting. For what a setting does not cover, such as another layout for the library or another way to sign in, the repository's `docs/hosting.md` names the one file to change for each assumption. It is written to be handed to a coding agent along with a description of your machine.

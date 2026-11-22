---
title: Updating and backing up
summary: How to upgrade Prosody, which files and volumes to back up, how to migrate hosts and how to tear down the stack.
order: 11
---

## Updating Prosody

From the repository root on the host:

```sh
git pull
pnpm install
pnpm check
pnpm run deploy --yes
```

- Run `pnpm run plan` before deploying if you want to inspect the changes first.
- Services are replaced during a deploy, so connected devices may briefly show **Offline** for a few seconds before reconnecting automatically.
- Existing reading copies stay untouched after an aligner update.
- Check the [blog](/blog) for release notes if an update requires extra steps.

## What to back up

| What | Where it lives | What happens if you lose it |
|---|---|---|
| Your book files | `PROSODY_LIBRARY` | Gone permanently. Prosody treats your library as your responsibility to back up. |
| Prosody's database | Docker's Postgres volume | You lose reading places, nightstand history, finished states and your desk list. The shelf itself rebuilds from your library on the next walk. |
| Deployment config and state | `.env` and `.alchemy/` in the repository | Without `.env`, recreate your paths. Without `.alchemy/`, Alchemy loses track of deployed services and you must remove them manually in Docker. |

You do not need to back up `PROSODY_COPIES` to avoid data loss: the press can regenerate every reading copy from your library. Keeping it, however, preserves the saved `heard-*.emissions` files so you do not have to re-listen to your audiobooks.

## Backing up Postgres

Prosody does not include a built-in backup job yet. Find the Postgres volume in Docker:

```sh
docker volume ls | grep -i prosody
```

Either run `pg_dump` inside the Postgres container or back up the volume while the stack is stopped, and store the backup alongside your other host backups.

## Moving to a new host

Keep the old host running until you have verified the new one:

1. Follow [Installing](/docs/installing) on the new host using the same library.
2. Restore your Postgres backup if you want to preserve reading places, finished books and wants.
3. Copy `PROSODY_COPIES` to the new host to avoid re-syncing every book.
4. Update DNS so your app's hostname points to the new host.

## Removing the stack

To tear down all deployed Docker services and volumes created by Alchemy:

```sh
pnpm run destroy
```

Back up Postgres first if you want to keep your reading places. Your library (`PROSODY_LIBRARY`), reading copies (`PROSODY_COPIES`) and `.env` are left untouched on disk.

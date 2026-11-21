---
title: Updating and backing up
summary: How to move to a new version, and which three things on the host are worth keeping.
order: 11
---

## Updating

```sh
git pull
pnpm install
pnpm check
pnpm run deploy --yes
```

- `pnpm run plan` first, if you want to see what will change.
- A deploy replaces the services. The app may say "Offline" for a few seconds while it does.
- When an update changes the aligner, books you have already synced stay as they were. "Align it again" in a book's reading room syncs it with the new one, in under a minute.
- Release notes, on the [blog](/blog), say when an update needs anything more than this.

## What to keep

| Thing | Where | If you lose it |
|---|---|---|
| Your books | Your library | They are gone. Prosody never held the only copy of anything, and backing up your library is yours to do. |
| What Prosody knows | Its Postgres volume | Your places, what you finished, and your list of wants start again. The shelf rebuilds itself from the library. |
| Your settings | `.env` and `.alchemy/` in the repository | You fill in `.env` again. Without `.alchemy/` the deploy tool no longer knows what it deployed, and you remove the old services by hand. |

The reading copies are not on the list. They can be made again from your books. It takes as long as syncing did the first time, unless you kept the copies folder, which also holds what the speech model heard.

## Backing up Postgres

There is no built-in backup yet. Until there is, the volume can be saved like any other Docker volume:

```sh
docker volume ls | grep -i prosody
```

Stop the stack or use `pg_dump` from inside the Postgres container, and store the result with your other backups.

## Moving to another machine

This has not been rehearsed end to end, so keep the old machine until the new one is right.

1. Install on the new machine, with the same library.
2. Restore the Postgres volume, if you want your places.
3. Copy the reading copies folder across, to skip syncing everything again.
4. Point the app's name at the new machine's tailnet address.

## Taking it down

```sh
pnpm run destroy
```

This removes the services, and with them what Prosody knows. Back up Postgres first if you want your places. Your library, the reading copies folder and `.env` are left alone.

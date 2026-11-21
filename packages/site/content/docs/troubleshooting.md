---
title: When something is wrong
summary: What you see, why, and what to do about it.
order: 10
---

## Where to look first

The press says what it is doing in its log. Find the service, and follow it:

```sh
docker service ls | grep press
docker service logs --follow <the press service>
```

Each walk of the library is logged, with how many works it found and any folder it could not read, and so is each book as it is synced.

## Installing and deploying

| What you see | Why, and what to do |
|---|---|
| The plan stops with "`PROSODY_LIBRARY` is not set" | `.env` is missing at the repository's root, or lacks that line. |
| `pnpm deploy` does something unexpected | That is a pnpm command of its own. Prosody's is `pnpm run deploy`. |
| The first deploy seems stuck | It is building the press's image, which downloads about a gigabyte of speech models. Give it several minutes. |

## Signing in

| What you see | Why, and what to do |
|---|---|
| 403 on every page | The request did not come from a tailnet address you own. Check the name resolves to the host's tailnet address, and that the device is yours and untagged. |
| 403 from the host itself | Expected, if the name resolves to the host's home-network address there. Sign-in admits tailnet addresses only. |
| 401 "Signed out" | The request skipped Caddy's `forward_auth`. Check the Caddy block. |

## The shelf

| What you see | Why, and what to do |
|---|---|
| The shelf is empty | The press could not read the library, or it is not laid out by author and title. The log names each folder it could not read. |
| A book is missing | Its folder is not two levels deep: `ebooks/<Author>/<Title>/`. |
| A book shows twice, once as text and once as audio | The author or title is spelled differently under `ebooks` and `audiobooks`. Rename one to match. |
| Books vanish and come back | A network share dropped out for a walk. Nothing is forgotten, and the next good walk catches up. |
| A cover is a plain binding with a letter | Neither the EPUB nor the audio file carries a picture. |

## Syncing

| What you see | Why, and what to do |
|---|---|
| A book stays "syncing" for an hour | Likely fine: a long audiobook takes about that. The log shows it at work. |
| A book is "not synced" | Its reading room gives the reason. [Syncing a book](/docs/syncing-a-book) lists what each one means. |
| The highlight drifts from the voice | Report it, with the book and the place. In the meantime, "Align it again" after an update may fix it. |
| Many sentences are never highlighted | In a technical book that is expected: code, tables and captions are not read aloud. |

## Reading

| What you see | Why, and what to do |
|---|---|
| "Offline", when you are not | The app lost its connection to the host and is asking again every few seconds. It comes back on its own. |
| A book opens at an old place | Another device read further while offline and has not sent its place yet. Open the book on that device, with a connection. |
| The book cannot be opened during "Align it again" | Expected. It opens when the new sync is done. |

## Asking for help

Open an issue on the repository, with what you did, what you saw, and the press's log from around that time. Leave out your domain and your paths if you would rather not share them.

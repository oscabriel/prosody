# Fetching books at the desk

The desk can fetch a book you want. It is optional: without it Prosody still shelves, aligns and opens whatever is in your library. This page sets it up; [`GLOSSARY.md`](GLOSSARY.md) defines its words and [`how-it-works.md`](how-it-works.md) says why it is built as it is.

## What happens

1. You want a book at the desk, by its title and author.
2. Prosody asks Prowlarr, which searches the trackers you have set up there, and offers the ten most seeded audiobooks and the ten most seeded ebooks.
3. You grab one. Nothing is ever grabbed for you.
4. qBittorrent downloads it. The desk shows how far it has come, and says when it stalls.
5. When the payload has arrived, the press copies its `.epub` or `.m4b` into your library. The payload stays where it is and goes on seeding.
6. The desk counts the hours it has seeded, and lets you release it once it has seeded what your tracker asks. Releasing takes it out of qBittorrent's list and leaves its files.

## What you need

| Thing | Why |
|---|---|
| Prowlarr | It holds your tracker accounts and does the searching. Prosody holds only its address and API key, never a tracker login. |
| qBittorrent, version 4 or 5 | It downloads and seeds. |
| A category in qBittorrent | Every grab is filed under it. Its save path must be the folder the host sees as `PROSODY_DOWNLOADS`: Prosody finds a payload by its path inside that folder, so a category that saves elsewhere is never shelved. |

## Settings

These go in `.env` beside the host's own (see [`../hosting.md`](../hosting.md)).

| Setting | Needed | What it is |
|---|---|---|
| `INDEXER_URL`, `INDEXER_API_KEY` | yes | Where Prowlarr answers, with no slash at the end, and its API key (Settings, General). |
| `DOWNLOADS_URL`, `DOWNLOADS_USERNAME`, `DOWNLOADS_PASSWORD` | yes | Where qBittorrent's Web UI answers, with no slash at the end, and what it signs in with. |
| `DOWNLOADS_CATEGORY` | no, `books` | The category every grab is filed under. |
| `PROSODY_DOWNLOADS` | yes | Where that category saves, as the host sees it. |

If you run neither, give the required settings placeholder values and point `PROSODY_DOWNLOADS` at any empty folder. A search then fails with the reason, the press logs a warning each minute, and reading is unaffected.

## The seeding rule

A private tracker usually asks that a payload be seeded for some time. Prosody refuses to release one until it has: 72 hours within 30 days of its arrival, as `OBLIGATION` in `packages/domain/src/Acquisition/ReleasePayload.command.ts`. Change it to your own tracker's rule; `hours: 0` lets every payload go as soon as it has come.

The hours counted are qBittorrent's, which run on while a tracker credits none. Check your tracker counts them before you release.

## Rules

- A payload in the downloads is never moved or deleted, by Prosody or by anyone working on it. Releasing one takes it out of qBittorrent's list only, and only once it has seeded what `OBLIGATION` asks.
- Test against a stand-in Prowlarr and qBittorrent, or a stage of its own (`ALCHEMY_STAGE`). Wanting a book on the live stack searches the real trackers, and grabbing one downloads it.

## Where each assumption lives

| Assumption | Where | To change it |
|---|---|---|
| The seeding rule | `OBLIGATION` in `packages/domain/src/Acquisition/ReleasePayload.command.ts` | Set your tracker's hours and days. |
| The Indexer is Prowlarr | The port `packages/domain/src/Acquisition/Indexer.external.ts`, the adapter `packages/server/src/ProwlarrIndexer.ts` | Write another adapter for the same port and provide it in `packages/server/src/ProsodyLive.ts`. |
| Downloads is qBittorrent | The port `packages/domain/src/Acquisition/Downloads.external.ts`, the adapters `packages/server/src/QBittorrent.ts` and `QBittorrentDownloads.ts`, and the press's watch, `packages/press/src/Watch.ts` | The same, and the watch must report progress for the new client. |

## When something is wrong

| What you see | Why |
|---|---|
| Every search fails | Prowlarr is down or refuses its key. The desk shows the reason. |
| A grab stalls at once | qBittorrent could not be reached, or would not add the torrent. Resume it once that is fixed. |
| A grab never reaches the shelf | The category does not save into `PROSODY_DOWNLOADS`, or the payload holds no single `.epub` or `.m4b`. The desk shows the reason. |

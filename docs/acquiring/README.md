# Fetching books at the desk

Fetching is optional. Without it, Prosody still shelves, aligns and opens the books already in your library, and the desk still keeps your wants and looks each one up in the public catalogues.

This guide covers setting up fetching on your own host. For the terms used in the code and UI, see [`GLOSSARY.md`](GLOSSARY.md). For how the model, adapters and press fit together, see [`how-it-works.md`](how-it-works.md).

## How a fetch runs

1. You want a book at `/desk` by entering its title and author.
2. Prosody asks Prowlarr to search the trackers you have configured there and offers up to ten of the most seeded audiobooks and ten of the most seeded ebooks.
3. You choose an offer and click **Grab**. Nothing is ever grabbed automatically.
4. Prosody fetches the `.torrent` file through Prowlarr and hands it to qBittorrent under your configured category, tagged with the grab's id.
5. The press checks qBittorrent every minute, reporting download progress and stalls to the desk.
6. Once the payload arrives, the press copies its single `.epub` or `.m4b` file into your library and runs a walk so the book appears on the shelf. The payload stays in the downloads folder and keeps seeding.
7. Once qBittorrent has seeded the payload for the hours your obligation requires, the desk enables **Release**. Releasing removes the torrent from qBittorrent's list while leaving its files on disk.

## Prerequisites

| Requirement | Notes |
|---|---|
| Prowlarr | Holds your tracker accounts and runs searches. Prosody only stores Prowlarr's URL and API key, never a tracker login. |
| qBittorrent 5 | Downloads and seeds grabs. Login, status watching, adding and releasing also handle qBittorrent 4 responses, but resuming an existing torrent calls qBittorrent 5's `/api/v2/torrents/start`. |
| A qBittorrent category | Every grab is filed under this category (default `books`). Its save path in qBittorrent must point to the same folder the host mounts as `PROSODY_DOWNLOADS`. |

## Settings

Add these to `.env` alongside your host settings (see [`../hosting.md`](../hosting.md)):

| Setting | Default | Purpose |
|---|---|---|
| `INDEXER_URL` | empty | Prowlarr base URL, with no trailing slash (for example `http://indexer.lan:9696`). |
| `INDEXER_API_KEY` | empty | Prowlarr API key (Settings, General). |
| `DOWNLOADS_URL` | empty | qBittorrent Web UI base URL, with no trailing slash (for example `http://downloads.lan:8080`). |
| `DOWNLOADS_USERNAME` | empty | qBittorrent Web UI username. |
| `DOWNLOADS_PASSWORD` | empty | qBittorrent Web UI password. |
| `DOWNLOADS_CATEGORY` | `books` | qBittorrent category assigned to every grab. |
| `PROSODY_DOWNLOADS` | empty | Host path where that category saves files. Mounted read-only into the press at `/downloads`. |

### Leaving fetching off

Leave all of these unset to run without fetching:

- The desk still accepts wants and looks each book up in Open Library, Audible and Audnexus.
- Searches fail with `Fetching is not set up on this host`.
- The press mounts no downloads folder and skips the qBittorrent watch.
- Reading and aligning books already in your library are unaffected.

## The seeding obligation

Private trackers usually require a payload to seed for a minimum time. Prosody enforces this in the model via `OBLIGATION` in [`packages/domain/src/Acquisition/ReleasePayload.command.ts`](../../packages/domain/src/Acquisition/ReleasePayload.command.ts), set to `72` hours within `30` days (`{ hours: 72, days: 30 }`).

- Prosody refuses `ReleasePayload` until qBittorrent reports at least `OBLIGATION.hours` of seeding time.
- The desk shows the target date calculated from `OBLIGATION.days` after arrival.
- Change `OBLIGATION` to match your tracker's rule. Setting `hours: 0` lets the desk show **Release** as soon as a payload arrives.

qBittorrent's `seeding_time` keeps counting even if your tracker rejects announces and credits no time. Check that your tracker counts the hours before clicking **Release**.

## Safety rules

- **Never move or delete a payload.** Prosody mounts `PROSODY_DOWNLOADS` read-only, copies editions into the library, and removes torrents with `deleteFiles=false`. Do not move or delete files in the downloads folder by hand while they are seeding.
- **Respect your seeding obligation.** Only release a payload once both qBittorrent and your tracker show the required time.
- **Never test fetching against the live stack.** Use stand-in Prowlarr and qBittorrent services, or a separate stage (`ALCHEMY_STAGE`). Wanting a book on the live stack searches your real trackers, and grabbing an offer downloads it.

## Swapping components

| Assumption | Where it lives | How to change it |
|---|---|---|
| Seeding rule (`72` hours, `30` days) | `OBLIGATION` in [`packages/domain/src/Acquisition/ReleasePayload.command.ts`](../../packages/domain/src/Acquisition/ReleasePayload.command.ts) | Edit `hours` and `days` to match your tracker. |
| Indexer is Prowlarr | Port: [`packages/domain/src/Acquisition/Indexer.external.ts`](../../packages/domain/src/Acquisition/Indexer.external.ts)<br>Adapter: [`packages/server/src/ProwlarrIndexer.ts`](../../packages/server/src/ProwlarrIndexer.ts) | Implement the `Indexer` port and provide it in [`packages/server/src/ProsodyLive.ts`](../../packages/server/src/ProsodyLive.ts). Note that [`packages/server/src/QBittorrentDownloads.ts`](../../packages/server/src/QBittorrentDownloads.ts) also imports `torrentOf` from `ProwlarrIndexer.ts` to fetch `.torrent` bytes ([issue 0015](../issues/0015-downloads-adapter-reaches-into-the-indexer.md)). |
| Downloads client is qBittorrent | Port: [`packages/domain/src/Acquisition/Downloads.external.ts`](../../packages/domain/src/Acquisition/Downloads.external.ts)<br>Adapters: [`packages/server/src/QBittorrent.ts`](../../packages/server/src/QBittorrent.ts), [`packages/server/src/QBittorrentDownloads.ts`](../../packages/server/src/QBittorrentDownloads.ts)<br>Watch: [`packages/press/src/Watch.ts`](../../packages/press/src/Watch.ts) | Implement `Downloads`, provide it in [`packages/server/src/ProsodyLive.ts`](../../packages/server/src/ProsodyLive.ts), and update `Watch.ts` to poll your client and report progress, stalls, arrival and seeding hours. |

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Every search fails | Prowlarr is unreachable, `INDEXER_URL` is unset, or `INDEXER_API_KEY` is rejected (`401`). | Read the failure note on the desk, fix Prowlarr or `.env`, and click **Search again**. |
| A grab stalls immediately | qBittorrent is unreachable, refused the login, rejected the torrent (for example a duplicate), or Prowlarr failed to return the `.torrent` file. | Check the stall reason on the desk, fix the underlying issue, and click **Resume**. |
| A grab arrived but stays `not shelved` | The category's save path does not match `PROSODY_DOWNLOADS`, the torrent's `content_path` is outside its `save_path`, the payload has zero or more than one `.epub`/`.m4b` file, or the target shelfmark already holds an edition of that kind. | Read the note on the grab. Temporary mount or copy failures retry every 5 minutes; structural refusals (`Unshelvable`) stop until you handle the file manually. |

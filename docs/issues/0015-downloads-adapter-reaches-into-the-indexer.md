# The downloads adapter fetches its file through the indexer's adapter

**Where:** `torrentOf` in `packages/server/src/ProwlarrIndexer.ts`, imported by `packages/server/src/QBittorrentDownloads.ts`

## What is wrong

`Downloads` and `Indexer` are separate external systems in the model (`packages/domain/src/Acquisition/Downloads.external.ts` and `Indexer.external.ts`), each with its own adapter. To start a download, `QBittorrentDownloads.ts` needs the bytes behind a release's `link`, and it gets them by importing `torrentOf` from `ProwlarrIndexer.ts`. That function reads the indexer's settings (`INDEXER_URL`, `INDEXER_API_KEY`) and calls the indexer directly, outside the `Indexer` port.

## What it costs

- The two adapters cannot be swapped independently. Replacing the indexer's adapter breaks downloads until `torrentOf` is rewritten or moved.
- The `Indexer` port does not show everything the app asks of an indexer, so a stand-in for it in a test or a rehearsal does not cover this call.

## How to fix

Add an operation to `Indexer` in `packages/domain/src/Acquisition/Indexer.external.ts` that returns the file behind a release's `link`, implement it in `ProwlarrIndexer.ts`, and have `QBittorrentDownloads.ts` ask the `Indexer` service for it instead of importing `torrentOf`.

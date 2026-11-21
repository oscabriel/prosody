# Acquiring

The terms Prosody uses for fetching a wanted book, from searching to shelving and seeding. The rest of the domain language is in the [root glossary](../../GLOSSARY.md).

## Language

### Wanting and grabbing

**Search**:
One numbered request to the Indexer for a want. Only the answer matching the want's latest search number is accepted; earlier answers and answers for withdrawn wants are ignored.
_Avoid_: Query, lookup

**Release**:
One upload of a book listed on a tracker, as the Indexer returns it (id, indexer, title, kind, size, seeders, publish date, info page and download link).
_Avoid_: Torrent, result, hit

**Offer**:
A release returned by the latest search for a want. Only a current offer can be grabbed.
_Avoid_: Result, candidate

**Grab**:
A release you chose to fetch, tracked by its own id (`<work>.<n>`) from download through shelving and seeding until it is released or abandoned. Only you create a grab; no policy grabs automatically.
_Avoid_: Download (for the whole), request, order

**Download**:
The transfer stage of a grab, while it is downloading or stalled and before its payload arrives.
_Avoid_: Grab, fetch

**Stall**:
A download that could not be started or has stopped making progress, recorded with a reason. It waits for you to resume or abandon it, or clears automatically if progress advances.
_Avoid_: Failure, error, timeout

**Payload**:
The file or folder a completed download leaves in the downloads, named by its relative path inside the category's save path. Prosody never moves or deletes it.
_Avoid_: Torrent, download, files

**The downloads**:
The folder on the host (`PROSODY_DOWNLOADS`) where payloads land. The press mounts it read-only.
_Avoid_: Torrents folder, incoming

**Obligation**:
The seeding requirement your tracker sets before a payload may stop seeding (`OBLIGATION`: hours required and the window in days).
_Avoid_: Ratio, seed time, rule

**Release a payload**:
To stop seeding a payload once its obligation is met, removing its torrent from Downloads while keeping its files on disk. As a verb, "release" is only ever used for a payload.
_Avoid_: Remove, delete, finish

**Abandon**:
To stop following a grab that is still downloading or stalled. Its torrent and any downloaded data remain in Downloads, and the release stays marked as grabbed on the want.
_Avoid_: Cancel, delete

### Who is asked

**Indexer**:
The external system that searches trackers for releases and fetches `.torrent` files. It holds your tracker accounts; Prosody only talks to the Indexer.
_Avoid_: Tracker, search provider

**Downloads**:
The external system that downloads a grab's torrent and seeds its payload, matching each torrent by its grab id tag.
_Avoid_: Client, torrent client

**Tracker**:
An external site that lists releases and sets the seeding obligation. Prosody never speaks to a tracker directly.
_Avoid_: Indexer, source

**Torrent**:
Downloads' own record for a grab's transfer. Prosody identifies it only by the grab id tag attached when it was added.
_Avoid_: Using it for a release, a grab or a payload

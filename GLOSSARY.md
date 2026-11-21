# Glossary

Every word below has one meaning in Prosody's code, app text, and documentation. Most live in [`packages/domain/src`](packages/domain/src); the rest name parts of the web app, the press, or the deployed stack.

Each entry gives the word, what it means in the code, and the words to avoid in its place. The separate vocabulary for fetching a wanted book at the desk is in [`docs/acquiring/GLOSSARY.md`](docs/acquiring/GLOSSARY.md).

## Books, editions, and the library

**Work**:
A book's identity in the model, independent of which files exist for it (`Work` aggregate in `packages/domain/src/Library/Work.aggregate.ts`). Its `WorkId` (`w-<hex>`) keys the work itself as well as its `Narration`, `Copy`, `Reading`, `Place`, and `Want`.
_Avoid_: Title, item, record

**Book**:
The reader-facing word used in the app and in reader commands (`WantBook`, `OpenBook`, `FinishBook`). The model represents each book as a work.
_Avoid_: Using it for a domain identifier; that is a work

**Edition**:
One file belonging to a work, of one `EditionKind` (`"text"`, `"audio"`, or `"pages"` in `packages/domain/src/Library/ShelveEdition.command.ts`). A work holds at most one shelved edition of each kind.
_Avoid_: File, format, version

**Text**:
A work's `"text"` edition: an `.epub` file, read sentence by sentence.
_Avoid_: Ebook (for the edition)

**Audio**:
A work's `"audio"` edition: a single `.m4b` audiobook file.
_Avoid_: Audiobook (for the edition), track

**Pages**:
A work's `"pages"` edition: a `.pdf` file, rendered as page images and shown one page at a time. Only this edition has pages.
_Avoid_: Scan, document

**Pair**:
A work's text and audio editions together (`Narration.pair` in `packages/domain/src/Narration/Narration.aggregate.ts`). Only a pair is aligned.
_Avoid_: Match, sync pair

**Edition alone**:
The single edition used when a work has no pair. `editionToCopy` in `packages/domain/src/Reading/CopyEdition.command.ts` picks it in priority order: `"text"`, else `"pages"`, else `"audio"`.
_Avoid_: Single, unpaired file

**Library**:
The directory of book files on the host (`PROSODY_LIBRARY`). It has two top-level folders, `ebooks` (for `.epub` and `.pdf` files) and `audiobooks` (for `.m4b` files), each arranged as `<author>/<title>/<file>`.
_Avoid_: Collection, media folder, shelf

**Shelfmark**:
A work's `<author>/<title>` folder path inside the library (`Shelfmark` in `packages/domain/src/Library/Shelfmark.ts`), shared across `ebooks` and `audiobooks` and sanitised for filesystem names by `shelfmarkOf`.
_Avoid_: Path, folder name, location

**Claim**:
A work's ownership of a shelfmark (`ShelfmarkClaim` aggregate in `packages/domain/src/Library/ShelfmarkClaim.aggregate.ts`). The first work to send `ClaimShelfmark` for a shelfmark holds it; any other work trying to claim the same shelfmark is rejected with `ShelfmarkTaken` and given the owning `WorkId`.
_Avoid_: Lock, reservation

**Catalogue**:
The set of works recorded in the model via `CatalogueWork` (`packages/domain/src/Library/CatalogueWork.command.ts`). A work is catalogued either when the press finds it during a walk (with a shelfmark and no description) or when it is wanted (with no shelfmark and a `Metadata` description).
_Avoid_: Database, index

**Description**:
Outside catalogue details for a work (`Description` in `packages/domain/src/Library/Metadata.external.ts`): first publication `year`, `openLibrary` work key, and `recording` if an audiobook match was found.
_Avoid_: Metadata (for one work's details), details

**Recording**:
An audiobook entry returned by external catalogues (`Recording` in `packages/domain/src/Library/Metadata.external.ts`): its `asin`, `narrators`, length in `minutes`, and `chapters`. It is metadata about an audiobook, never an audio file on disk.
_Avoid_: Audio, edition

**Shelved**:
The state of an edition that sits in its work's folder in the library and has been recorded by `ShelveEdition` (`packages/domain/src/Library/ShelveEdition.command.ts`). To shelve a fetched book is to copy its edition into the library while leaving the original fetched file untouched.
_Avoid_: Import, move, file

**Walk**:
One pass by the press (`Stacks.walk` in `packages/press/src/Stacks.ts` and `Press.walk` in `packages/press/src/Press.ts`) over both halves of the library, running every 5 minutes and after shelving a fetched book. For each book found, the press claims its shelfmark, catalogues the work, records each edition, and sends `PairEditions` or `CopyEdition`.
_Avoid_: Scan, sync, import

**Shelf**:
The `Shelf` view (`packages/domain/src/Library/Shelf.view.ts`) and main library screen (`packages/web/src/Shelf.ts`). It lists every catalogued work that has a shelfmark, together with its shelved editions and the state of its alignment or edition-alone reading copy.
_Avoid_: Library (for the view), list, home

## Alignment and reading copies

**Narration**:
The `Narration` aggregate (`packages/domain/src/Narration/Narration.aggregate.ts`), keyed by `WorkId`. It holds a work's pair (`shelfmark`, `text`, `audio`), its alignment status (`"unpaired"`, `"aligning"`, `"aligned"`, or `"failed"`), and the current attempt number.
_Avoid_: Sync, audiobook

**Alignment**:
Matching each sentence of a pair's text to the start and end times where it is spoken in the audio (`packages/aligner/src/Align.ts`). In the domain, `Alignment` (`packages/domain/src/Narration/Alignment.policy.ts`) is the policy that schedules a 6-hour `ExpireAlignment` deadline and dispatches an `AlignRequest` to `Aligner`.
_Avoid_: Sync (for the process), matching, transcription

**Synced**:
The shelf's label for a paired work whose alignment succeeded (`Sync.state` `"synced"` in `packages/domain/src/Library/Shelf.view.ts` and `packages/web/src/Shelf.ts`). While alignment is running, the shelf calls it `"syncing"`; if it fails, `"not synced"`.
_Avoid_: Aligned (in the app's own text), matched

**Try**:
One attempt to align a pair or make a reading copy for an edition alone. Both `Narration` and `Copy` number each try with `attempt` (`Schema.Int`) and ignore any result whose `attempt` does not match the running one.
_Avoid_: Job, run, retry

**Request**:
Work dispatched from the model to the press: `AlignRequest` (`Aligner.external.ts`), `CopyRequest` (`Copier.external.ts`), or `ShelveRequest` (`Stacks.external.ts`). The press persists each request under `.pending` (`packages/press/src/Pending.ts`) and queues it until finished.
_Avoid_: Job, task, message

**Timeline**:
The ordered list of every sentence in a paired work (`Timeline` in `packages/domain/src/Reading/Copy.ts`, written to `timeline.json`). Each entry is either `"aligned"` with `start` and `end` times in seconds, or `"unaligned"` when the sentence was not found in the audio.
_Avoid_: Sync map, overlay

**Spot check**:
Verifying an alignment with a second speech model (`SpotCheck` in `packages/aligner/src/SpotCheck.ts`), which transcribes up to 40 aligned sentences (3 to 15 seconds long) spread across the book. `ReadingCopies.make` (`packages/press/src/ReadingCopies.ts`) refuses the alignment if no sentences can be checked or fewer than three-quarters match.
_Avoid_: Verification, QA

**Heard**:
The acoustic model's cached output for a work's audio (`heard-<size>.emissions`, kept in the reading copy folder by `packages/press/src/ReadingCopies.ts` and reused by `packages/aligner/src/Aligner.ts`), so re-aligning the same audio file skips listening to it again.
_Avoid_: Transcript, cache

**Reading copy**:
The set of files the press builds for a work in the reading room (`packages/press/src/ReadingCopies.ts`): `contents.json`, a `cover.jpg` if available, and whichever of sentence-marked text, audio, `timeline.json`, an aligned `.epub`, or rendered page pictures the work requires. Both pairs and editions alone have reading copies (`Copy` aggregate and `ReadingCopy` policy handle editions alone).
_Avoid_: Cache, transcode, derivative

**Contents**:
The `Contents` schema (`packages/domain/src/Reading/Copy.ts`), written to `contents.json` in each reading copy. It lists the copy's `audio` file, text `sections`, audio `chapters`, `cover`, rendered page `pictures`, and PDF `headings`.
_Avoid_: Manifest, index

**Section**:
One narrated HTML document from an EPUB, paired with a `title` (`Contents.sections` in `packages/domain/src/Reading/Copy.ts` and `packages/aligner/src/MarkedSections.ts`). Text editions are read one section at a time and do not have pages.
_Avoid_: Page, document, file

**Sentence**:
One marked sentence in a work's text (`Sentence` branded string in `packages/domain/src/Reading/Sentence.ts`, identified as `<section-path>#<span-id>`). It is the unit of alignment and of place in text and paired works.
_Avoid_: Span, segment, line

**Chapter**:
An entry in the reading room's table of contents (`chaptersIn` in `packages/web/src/Steps.ts`): a `section` for text or paired works, a `Chapter` (`title`, `start`, `end` in `packages/domain/src/Reading/Copy.ts`) for audio alone, or a `Heading` for pages.
_Avoid_: Track, part

**Heading**:
An outline entry from a pages edition (`Heading` in `packages/domain/src/Reading/Copy.ts`), holding a `title` and the 1-based `page` number where it begins.
_Avoid_: Bookmark, outline entry

## Reading and devices

**Reading room**:
The web view where one work is opened to read or listen (`packages/web/src/Room.ts`): paired text with synchronised audio, text alone, audio alone, or printed pages.
_Avoid_: Reader, player, viewer

**Reading**:
The `Reading` aggregate (`packages/domain/src/Reading/Reading.aggregate.ts`), keyed by `WorkId`. It stores a work's current `place` and its `stage`.
_Avoid_: Progress, session

**Place**:
Your current spot in a work (`PlaceAt` and `KeptPlace` in `packages/domain/src/Reading/Sentence.ts`, exposed by the `Place` view in `packages/domain/src/Reading/Place.view.ts`): a `sentence` for text or paired works, a `time` for audio alone, or a `page` for pages, stamped with `at` and `device`. There is one place per work across all devices; older timestamps are rejected with `StalePlace`.
_Avoid_: Position, progress, bookmark

**Stage**:
Where a work stands in your reading (`Stage` in `packages/domain/src/Reading/Stage.ts`): `"unopened"`, `"reading"`, `"finished"`, or `"setAside"`.
_Avoid_: Status, state

**Standing**:
A work's `stage` together with `at` and `device` (`Standing` in `packages/domain/src/Reading/Nightstand.view.ts`). It updates when a work is opened, finished, or set aside, and also whenever a place is kept while the work is in `"reading"`.
_Avoid_: Bedside, progress

**Nightstand**:
The `Nightstand` view (`packages/domain/src/Reading/Nightstand.view.ts`) and the top section of the shelf (`packages/web/src/Shelf.ts`). The view records the `Standing` of every opened work; the shelf displays those in stage `"reading"`, most recently read first, under "On the nightstand".
_Avoid_: Continue reading, in progress, recents

**Set aside**:
Moving a work from `"reading"` to `"setAside"` (`SetAside` command in `packages/domain/src/Reading/SetAside.command.ts`). It removes the work from the nightstand without finishing it or clearing its `place`; sending `OpenBook` returns it to `"reading"`.
_Avoid_: Archive, pause, hide

**Kept copy**:
A reading copy stored in full in a device's browser Cache Storage (`packages/web/src/DeviceCopies.ts`) so the work can be opened offline.
_Avoid_: Download, offline cache

**Device**:
One of your own machines on your tailnet (`Device` request context in `packages/domain/src/Device.context.ts`), identified by its Tailscale `ComputedName` (`packages/server/src/Tailscale.ts`). Tagged nodes and nodes owned by other users are refused.
_Avoid_: Client, user, account

## Wanting books

**Desk**:
The web view (`packages/web/src/Desk.ts`) backed by the `Wanted` view (`packages/domain/src/Acquisition/Wanted.view.ts`), where you record books you want, fetch them, and follow them to the shelf.
_Avoid_: Requests, downloads page, queue

**Want**:
The `Want` aggregate (`packages/domain/src/Acquisition/Want.aggregate.ts`), keyed by the `WorkId` the book will have.
_Avoid_: Request, wishlist item

**Withdraw**:
Stopping a want via `WithdrawWant` (`packages/domain/src/Acquisition/WithdrawWant.command.ts`). It marks the want inactive and removes it (and its catalogue entry on the desk) from the `Wanted` view; any fetch already started continues independently.
_Avoid_: Cancel, remove

The words for fetching a wanted book are in [`docs/acquiring/GLOSSARY.md`](docs/acquiring/GLOSSARY.md).

## External systems

**Metadata**:
The `Metadata` external system (`packages/domain/src/Library/Metadata.external.ts`) that looks up a work's title, author, and `Description` from external book and audiobook catalogues (`packages/server/src/OpenLibraryMetadata.ts`).
_Avoid_: Scraper, provider

**Stacks**:
The `Stacks` external system (`packages/domain/src/Library/Stacks.external.ts`) through which the model asks the press to shelve a fetched edition into the library, implemented by `packages/press/src/Stacks.ts`.
_Avoid_: Storage, importer

**Aligner**:
The `Aligner` external system (`packages/domain/src/Narration/Aligner.external.ts`) that aligns a pair and writes its reading copy, backed by `packages/aligner/src/Aligner.ts` inside the press.
_Avoid_: Syncer, transcriber

**Copier**:
The `Copier` external system (`packages/domain/src/Reading/Copier.external.ts`) that makes a reading copy for an edition alone, handled by the press (`packages/press/src/ReadingCopies.ts`).
_Avoid_: Converter, transcoder

## Runtime parts

**Model**:
The `Prosody` domain model (`packages/domain/src/Prosody.model.ts`): its aggregates (`Want`, `Grab`, `Work`, `ShelfmarkClaim`, `Narration`, `Copy`, `Reading`), views (`Wanted`, `Shelf`, `Place`, `Nightstand`), and policies.
_Avoid_: Backend, server, database

**Runner**:
The `Runners` container pool (`packages/server/src/ProsodyLive.ts`) that hosts the model's cluster entities and policies.
_Avoid_: Worker, node

**Api**:
The `Api` service (`packages/server/src/Api.ts`): serves the web app, `/auth`, `ReaderApi` at `/api`, reading copy files at `/copies/` (mounted read-only), and `PressApi` at `/press` (refused if relayed via `x-forwarded-for`).
_Avoid_: Backend, gateway

**Session**:
The `Session` RPC middleware (`packages/domain/src/Session.middleware.ts`, implemented in `packages/server/src/Session.ts`) that checks incoming requests and provides `Device`, or fails with `SignedOut`. Together with `/auth`, it admits only same-site requests from your own tailnet devices.
_Avoid_: Login, auth, account

**Press**:
The `Press` service (`packages/press/src/Press.ts`): the only part that mounts the library or writes reading copies. It walks the library, shelves fetched books, and builds reading copies, implementing `Stacks`, `Aligner`, and `Copier`.
_Avoid_: Worker, processor, scanner

**Relay**:
The `Relay` Caddy container (`alchemy.run.ts`) that reverse-proxies `PROSODY_RELAY` on the host to `Api` inside the Docker network.
_Avoid_: Proxy, ingress

**Host**:
The machine Prosody is deployed to, configured via `.env` and read by `packages/server/src/Host.ts`.
_Avoid_: Server, box, any machine's own name

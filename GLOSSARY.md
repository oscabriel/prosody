# Prosody

The words Prosody uses for the route a book travels: wanted, shelved, aligned, and read or heard. One model, in `packages/domain`, speaks all of them.

## Language

### The library

**Work**:
One book as the model knows it, whatever its editions. Everything else is keyed by its work.
_Avoid_: Title, item, record

**Book**:
What a reader calls it: the thing you want, open and finish. The model knows each book as a work.
_Avoid_: Using it for an identity; that is a work

**Edition**:
One file of a work, of one kind: its text, its audio or its pages. A work has at most one edition of each kind.
_Avoid_: File, format, version

**Text**:
The edition of a work that is read sentence by sentence: an EPUB.
_Avoid_: Ebook (for the edition)

**Audio**:
The edition of a work that is heard: one audiobook file.
_Avoid_: Audiobook (for the edition), track

**Pages**:
The edition of a work as it was printed, shown a page at a time: a PDF. Only this edition has pages.
_Avoid_: Scan, document

**Pair**:
A work's text and audio together. Only a pair is aligned.
_Avoid_: Match, sync pair

**Edition alone**:
The one edition a work with no pair is read or heard by: its text, else its pages, else its audio.
_Avoid_: Single, unpaired file

**Library**:
The book files on the host, in a folder for every author and, inside it, one for every title.
_Avoid_: Collection, media folder, shelf

**Shelfmark**:
Where a work sits in the library: its author's folder and its title's folder.
_Avoid_: Path, folder name, location

**Claim**:
A work's hold on a shelfmark. The first work to claim a folder holds it, and every later one is told whose it is.
_Avoid_: Lock, reservation

**Catalogue**:
The model's record of every work it knows, found in the library or wanted. To catalogue a work is to enter it there.
_Avoid_: Database, index

**Description**:
What the catalogues outside know of a work beyond its title and author.
_Avoid_: Metadata (for one work's), details

**Shelf**:
Every catalogued work in the library, as the app shows them, each with how its reading copy stands.
_Avoid_: Library (for the view), list, home

**Walk**:
One pass by the press over the whole library, reporting every work, edition, pair and edition alone it finds.
_Avoid_: Scan, sync, import

**Shelved**:
An edition is shelved once it is in its work's folder in the library and the catalogue knows it. To shelve a book that was fetched is to copy its edition there; what was fetched stays where it is.
_Avoid_: Import, move, file

### Alignment and reading copies

**Narration**:
A pair, and the timeline that joins its text to its audio.
_Avoid_: Sync, audiobook

**Alignment**:
Finding where each sentence of a pair's text is spoken in its audio.
_Avoid_: Sync (for the act), matching, transcription

**Synced**:
What the shelf calls a work whose pair is aligned. While the press is aligning it, it is syncing.
_Avoid_: Aligned (in the app's own text), matched

**Try**:
One go at an alignment or a reading copy. Each has its own number, its attempt, so a late answer to an old try is ignored.
_Avoid_: Job, run, retry

**Request**:
What the model asks of the press: to align a pair, to copy an edition alone, or to shelve a book that was fetched. It waits in the press's queue until it is answered.
_Avoid_: Job, task, message

**Timeline**:
Every sentence of a work in reading order, each with its place in the audio, or none when it was not found there.
_Avoid_: Sync map, overlay

**Spot check**:
Listening to a spread of aligned sentences with a second speech model, to confirm the right words are there. An alignment that fails it is refused.
_Avoid_: Verification, QA

**Reading copy**:
What the press makes of a work for the reading room: its text marked sentence by sentence, its audio, the pictures of its pages, and its cover, as the work has them. A pair has one, and so does a work with an edition alone.
_Avoid_: Cache, transcode, derivative

**Contents**:
What a reading copy says it holds: the audio to play, the sections to read, the pictures of its pages, the chapters and the cover.
_Avoid_: Manifest, index

**Section**:
One part of a work's text, as its EPUB divides it, with a title. A text is read a section at a time, and never has pages.
_Avoid_: Page, document, file

**Sentence**:
One sentence of a work's text, and the unit of alignment and of place.
_Avoid_: Span, segment, line

**Chapter**:
What a reading room's contents list, by title. In a text it is a section, in audio alone a stretch of the audio from its start to its end, and in pages a heading.
_Avoid_: Track, part

**Heading**:
A chapter of a work's pages: its title, and the page it begins on.
_Avoid_: Bookmark, outline entry

**Recording**:
An audiobook of a work as the catalogues outside describe it: its narrators, its length and its chapters. It is a description, never a file.
_Avoid_: Audio, edition

**Heard**:
What the speech model heard of a work's audio, kept beside its reading copy so that aligning again never listens again.
_Avoid_: Transcript, cache

### Reading

**Reading room**:
Where one work is read or heard, with the audio following the text.
_Avoid_: Reader, player, viewer

**Place**:
Where you are in a work: a sentence, or a time in a work with its audio alone, or a page in a work of pages. There is one per work, whichever device kept it.
_Avoid_: Position, progress, bookmark

**Device**:
One of your own machines, known by its name in the tailnet.
_Avoid_: Client, user, account

**Reading**:
Your reading of one work: your place in it, and its stage.
_Avoid_: Progress, session

**Stage**:
Where a work stands with you: unopened, reading, finished or set aside.
_Avoid_: Status, state

**Standing**:
A work's stage, with when it last changed and on which device.
_Avoid_: Bedside, progress

**Nightstand**:
The works you are reading now, the newest first. The shelf opens on it.
_Avoid_: Continue reading, in progress, recents

**Set aside**:
To take a work off the nightstand without finishing it. Your place is kept, and opening it puts it back.
_Avoid_: Archive, pause, hide

**Kept copy**:
A reading copy held whole on a device, to read or hear with no network.
_Avoid_: Download, offline cache

### Wanting

**Desk**:
Where you want books, and follow each one to the shelf.
_Avoid_: Requests, downloads page, queue

**Want**:
A book you want, keyed by the work it will be.
_Avoid_: Request, wishlist item

**Withdraw**:
To stop wanting a book. Its offers go with it.
_Avoid_: Cancel, remove

The words for fetching a wanted book are in [`docs/acquiring/GLOSSARY.md`](docs/acquiring/GLOSSARY.md).

### Who is asked

**Metadata**:
Whatever knows about books in general: the catalogues outside.
_Avoid_: Scraper, provider

**Stacks**:
The library as the one thing that writes to it.
_Avoid_: Storage, importer

**Aligner**:
Whatever aligns a pair and makes its reading copy.
_Avoid_: Syncer, transcriber

**Copier**:
Whatever makes a reading copy from an edition alone.
_Avoid_: Converter, transcoder

### The parts

**Model**:
Everything Prosody knows and decides: what you want, the library, each narration, each reading copy and each reading.
_Avoid_: Backend, server, database

**Press**:
The one part that touches book files. It walks the library, makes reading copies and shelves what was fetched, and it plays Stacks, the Aligner and the Copier.
_Avoid_: Worker, processor, scanner

**Api**:
The model's front door for your devices and for the press, and the server of the app itself.
_Avoid_: Backend, gateway

**Relay**:
The one door from the host into the stack.
_Avoid_: Proxy, ingress

**Runner**:
The container that hosts the model.
_Avoid_: Worker, node

**Host**:
The machine Prosody is deployed to.
_Avoid_: Server, box, any machine's own name

**Session**:
What admits a request and says which device sent it.
_Avoid_: Login, auth, account

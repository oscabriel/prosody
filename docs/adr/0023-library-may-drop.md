# Treat the library as a network share that can hang or read empty

## Decision

`Stacks` (`packages/press/src/Stacks.ts`) treats `/library` and `/downloads` as network mounts that may hang or silently read empty:

- **Walking** (`Stacks.walk`): never fails the whole walk. Unreadable directories are logged and skipped; an empty mount yields zero books and changes nothing because the press only reports what it finds.
- **Shelving** (`Stacks.shelve`): verifies that `/library` and `/downloads` answer within `MOUNT_TIME = "8 seconds"` and that `/library` contains both `ebooks` and `audiobooks`, or fails with `StacksUnavailable` and writes nothing.
- **Atomic copy**: editions copy to `.<file>.part` and rename into place. An existing `<file>` of the exact expected byte size is treated as a completed copy from an interrupted run; a different file or size fails with `Unshelvable`.

## Why

A dropped SMB or NFS mount either hangs I/O calls indefinitely or exposes the underlying empty mountpoint directory without returning an error. Writing into an unmounted directory would silently put book files onto the host's local root filesystem instead of the share. Copying to a hidden `.part` file prevents a concurrent walk from indexing a half-copied book.

## What breaks if you change this

- Removing the 8-second timeout or the `ebooks`/`audiobooks` presence check in `Stacks.shelve` lets a dropped share either hang the shelving worker or copy books onto the local filesystem under the empty mountpoint.
- Copying directly to the final filename instead of `.<file>.part` lets a 5-minute walk pick up a partial file and send the wrong byte size to the model and aligner.
- Making `Stacks.walk` fail on a single unreadable directory stops the rest of the library from being walked.

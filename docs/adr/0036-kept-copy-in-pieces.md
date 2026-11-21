# A kept copy is fetched in pieces and is whole once its record is written

"Keep on this device" puts a work's copy in a cache of its own: its text first, then its audio in 8 MiB pieces, small enough to fetch again after a drop, and a record last, so a copy without its record is not whole and keeping it again fetches only what is missing. The cache keeps no partial answers, so each piece is stored as a whole answer with the Api's headers. A copy's size is measured from what is kept, since a compressed response states no length.

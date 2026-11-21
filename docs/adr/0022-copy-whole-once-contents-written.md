# A reading copy is whole once its contents are written

A reading copy is a folder for its work: the marked text unpacked, the audio, the pictures of its pages, a cover and a timeline. `contents.json` is written last, so a copy that has one is complete and one without is unfinished. A new try starts from an emptied folder, keeping only what the speech model heard. The Api serves the folder read-only and only what the reading room needs; the copy's EPUB and what the model heard stay private, and audio is answered by single byte ranges, the only form a media element sends.

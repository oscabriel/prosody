# A pair's reading copy is a valid EPUB 3 with media overlays

The aligned book is written back as an EPUB 3 with a SMIL overlay for every section that has an aligned sentence and the audio inside, so it can be read by any reader that follows the standard. That fixes several details: the mimetype comes first and stored, the book's duration is the sum of its overlays', times are rounded in whole milliseconds first, and two sections that share a file name get overlays of different names.

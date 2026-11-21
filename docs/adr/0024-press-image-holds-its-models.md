# The press's image holds its models and runs offline

The image is built with ffmpeg, poppler and both speech models, downloaded at pinned revisions the aligner was tested with, so the press needs no network to align and a model cannot change underneath it. The library that runs the models loads a native library, so it is installed in the image and left out of the bundle. The press runs as the user who owns the library and the copies folder, so what it writes there is theirs.

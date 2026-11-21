# Audio is streamed and never held whole

ffmpeg's output is read as a stream of raw 16 kHz mono floats, and the audio is copied into the reading copy's archive in pieces, stored and not compressed, so a twenty-hour book never sits in memory. The stream fails when ffmpeg does, or a file that stops decoding halfway would read as a shorter book, and ffmpeg's messages go to the log because a pipe nobody reads would fill and stall it. The archive is written without ZIP64, so a copy must stay under 4 GB.

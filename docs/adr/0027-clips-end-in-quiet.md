# A sentence's clip starts and ends in quiet

A token's frame is not where its sound starts, so each placed sentence's start moves back and its end runs on through sound to the nearest quiet, only so far and never into a neighbour. Quiet shorter than a pause, such as a stop's closure inside a word, is crossed. Where speech runs on, the two clips meet at its quietest moment, so no audio belongs to two sentences. The thresholds were tuned against Whisper's word times on six books.

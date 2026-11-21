# The press makes a new connection for every call and repeats its answers

A deploy replaces services stop-first, and for a few seconds the Api's name reaches the calling container itself; Bun would keep that connection and send every later call down it. So the press calls the model with `keepalive: false`. An answer about a copy or a payload is sent again for five minutes, long enough for a deploy to replace the Api; a pair's answer is covered by its deadline.

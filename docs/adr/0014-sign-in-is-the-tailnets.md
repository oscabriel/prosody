# Sign-in is the tailnet's

There are no accounts. Caddy asks the Api's `/auth` about the address of every request, and the Api asks `tailscaled` whose machine that is: an untagged machine of the host's owner is let in under its name, and a tagged one never, since it belongs to no one. A refusal is a 403 that says nothing, with the reason in the log. An answer is kept for 30 seconds because one page load asks many times; a refusal is kept too, and `tailscaled` not answering is never kept. A request sent in TLS early data is answered 425, since its address cannot be trusted yet.

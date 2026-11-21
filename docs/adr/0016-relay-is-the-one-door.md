# The relay is the one door into the stack

Caddy runs with host networking and cannot join a swarm network, and a swarm service's published port listens on every interface. So the Api publishes no port, and a plain Caddy container, the relay, joins the stack's network and listens on a loopback address alone. The press calls the Api directly by name; a reverse proxy always adds a forwarding header, so the Api closes `/press` to any request that carries one.

# The Api runs as nobody and is replaced when tailscaled restarts

The Api mounts the folder that holds `tailscaled`'s socket. `tailscaled` lets root and its operator change its settings through that socket and only answers anyone else, and a mount cannot limit a socket, so the Api's image runs as `nobody`. systemd makes the folder anew whenever `tailscaled` starts, which the mount cannot see, so a healthcheck tests for the socket and swarm replaces the Api.

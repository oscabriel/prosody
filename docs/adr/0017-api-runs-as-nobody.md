# Run the Api as nobody

> Amended by [ADR 0053](0053-readers-sessions-and-single-sign-on.md). `Api` still runs as `USER nobody` for least privilege, but no longer bind-mounts `/var/run/tailscale` or probes `tailscaled.sock`; its Docker Swarm healthcheck now probes `GET /health` on port `3000`.

## Decision

The Api's base image (`packages/web/Dockerfile`) sets `USER nobody`. `Api` (`packages/server/src/Api.ts`) bind-mounts `/var/run/tailscale` read-only and configures a Docker Swarm healthcheck:

```ts
healthcheck: {
	cmd: `test -S ${TAILSCALE}/tailscaled.sock`,
	interval: "10s",
	retries: 2,
}
```

## Why

- `tailscaled` grants administrative rights (changing tailnet settings) over `tailscaled.sock` to `root` and its configured operator, and allows read-only queries (`status`, `whois`) to unprivileged users. A read-only bind mount does not prevent writes to a Unix domain socket, so running the container as `nobody` is what restricts the Api to read-only queries.
- When `tailscaled` restarts under systemd, systemd recreates `/var/run/tailscale` with a new directory inode. Existing bind mounts still point at the unlinked old directory where `tailscaled.sock` no longer exists. Failing the healthcheck makes Docker Swarm replace the `Api` container so it mounts the new directory.

## What breaks if you change this

- Removing `USER nobody` from `packages/web/Dockerfile` gives the Api container root-level control over the host's `tailscaled` daemon.
- Removing the `test -S /var/run/tailscale/tailscaled.sock` healthcheck leaves `/auth` permanently failing after any `tailscaled` restart or upgrade until someone manually redeploys `Api`.

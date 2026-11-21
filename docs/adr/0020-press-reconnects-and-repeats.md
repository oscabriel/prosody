# Open a fresh HTTP connection per press call and retry answers for five minutes

## Decision

In `packages/press/src/Press.ts`, every background loop (`walk`, `watchDownloads`, `shelving`, `waiting`) runs with `freshConnections`:

```ts
const freshConnections = Effect.provideService(FetchHttpClient.RequestInit, {
	keepalive: false,
});
```

When reporting copy or shelving outcomes (`RecordCopy`, `RecordCopyFailed`, `RecordShelved`, `RecordNotShelved`), the press wraps the HTTP call in `persistently`:

```ts
const persistently = <A, E, R>(answer: Effect.Effect<A, E, R>) =>
	Effect.retry(answer, { schedule: Schedule.spaced("10 seconds"), times: 30 });
```

Alignment answers (`RecordAlignment`, `RecordAlignmentFailed`) are not wrapped in `persistently`; they rely on `Narration`'s 6-hour `ExpireAlignment` deadline instead.

## Why

Docker Swarm replaces services stop-first during a deploy. For a few seconds while `Api` is restarting, DNS for `prosody-api` can resolve to a stale address or the calling container itself; Bun's HTTP client would otherwise reuse that broken keep-alive socket for subsequent calls. Disabling keep-alive forces each call to open a fresh connection. Retrying copy and shelving answers every 10 seconds for 5 minutes (30 tries) bridges a normal deploy window without losing the result of finished work.

## What breaks if you change this

- Removing `keepalive: false` lets a single deploy poison the press's HTTP connection pool so later walks and reports keep failing.
- Removing `persistently` on copy or shelving reports drops finished work if `Api` happens to be restarting at the moment a copy or shelve completes, leaving `Copy` or `Grab` stuck until the next manual action or restart.

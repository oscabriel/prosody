# Read stored state with defaults and keep persisted field names

## Decision

Prosody does not run data migrations on its event store, views or on-disk `contents.json` files. Instead:

- **New fields** decode with `Schema.withDecodingDefaultKey(...)` when absent in older records (for example `page` and `time` on `PlaceAt`, `stage` on `Reading`, `note` on `Grab`, and `chapters`/`cover`/`pictures`/`headings` on `Contents`).
- **Renamed fields** keep their stored wire name with `Schema.encodeKeys`. In `Contents` (`packages/domain/src/Reading/Copy.ts`), `sections` is still encoded as `pages` in `contents.json`.

## Why

The event log, view snapshots and `/copies/*/contents.json` files outlive deploys. Decoding missing fields with defaults and preserving persisted key names keeps every historical event, view and reading copy readable without offline migration scripts or downtime.

## What breaks if you change this

- Adding a required field to an aggregate state, view state, event or `Contents` without `Schema.withDecodingDefaultKey` causes decoding failures when reading existing Postgres state or `/copies/*/contents.json`.
- Renaming a persisted field without `Schema.encodeKeys` breaks existing reading copies on disk and previously stored events or views.

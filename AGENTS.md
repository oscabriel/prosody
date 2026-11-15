# Prosody

One self-hosted app for the whole route a book travels: wanting it, fetching it, shelving it, syncing its audiobook to its ebook, and reading or listening. It does the work of a book grabber, an audiobook server, an ebook reader and an aligner in one. the indexer and the download client stay outside it.

## State

Spikes only. No app code exists. Each spike is a gate: its `NOTES.md` says whether it passed and what that decided.

## Before using an API

- Alchemy's domain framework (`@alchemy.run/domain`) and its Effect Cluster host are weeks old. Read the installed `node_modules` source, and Alchemy's own docs, before writing against them. The code in the plan is a sketch that was never run.
- Read `node_modules/effect/AGENTS.md` before writing Effect code. Effect 4 differs from what you remember.
- Alchemy stays on the newest release.

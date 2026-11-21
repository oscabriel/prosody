# The model decides and knows nothing of how it is hosted

The model in `packages/domain` imports only `effect` and `@alchemy.run/domain`, and the linter enforces it. Everything it needs from outside is a port it asks (`Indexer`, `Downloads`, `Metadata`, `Stacks`, `Aligner`, `Copier`), played by an adapter in `packages/server` or by the press. We chose this so every rule can be tested as a story with no Docker, Postgres or files, and so a different indexer or download client is one new adapter.

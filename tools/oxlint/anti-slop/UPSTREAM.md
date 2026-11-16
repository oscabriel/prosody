# Upstream

- Source: [K-Mistele/anti-slop](https://github.com/K-Mistele/anti-slop), Kyle Mistele's fork of [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop). MIT licensed.
- Commit: `b7c1619b4d51b4815e89ba3700a975a6ec54b8c3` (2026-11-15).
- Copied: `skills/install-anti-slop/assets/anti-slop`, the tree its installer copies, unchanged.
- Enabled in `oxlint.config.ts`: every core rule and every Effect rule, as errors. Not enabled: the Martin Fowler smells (they warn, and warnings fail `pnpm check`), the Jev rules and the diff rules (they send source to a paid model on each run).
- `vendor/eslint-stylistic/` keeps its own MIT licence and `UPSTREAM.md`.

To update, read the fork's `skills/install-anti-slop/references/update.md`, merge rather than replace, and record the new commit here.

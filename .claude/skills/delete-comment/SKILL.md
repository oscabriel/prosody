---
name: delete-comment
description: Sort every code comment into tautology, stale, excuse or decision record, then delete them all, filing an issue for each excuse and an ADR for each decision.
disable-model-invocation: true
---

# Delete comment

Code in this repository carries no comments. Anything worth keeping moves to where it can be maintained: a design decision into `docs/adr/`, a hack or workaround into `docs/issues/`, and a domain term into `GLOSSARY.md`. Run this workflow whenever comments have crept back in.

## How comment checking works

`tools/oxlint/prosody/comments.ts` finds and strips comments across git-tracked files. Run it with `node` from the repository root, optionally passing paths to limit the scope.

- **Checked:** JavaScript and TypeScript (`.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`, including `#!` shebangs and tool directives such as `oxlint-disable`, `@ts-expect-error` and `/// <reference>`), `.css`, `.html`, `Dockerfile`, `.yaml`/`.yml` and `.dockerignore`.
- **Skipped:** `tools/oxlint/anti-slop/`, `pnpm-lock.yaml`, `.env.example` and binary files.

`pnpm check` fails while any comment remains: `prosody/no-comments` reports comments in linted JS/TS, and `pnpm comments` catches comments hidden behind disable directives plus all other checked file types.

## Categories

Assign every comment in the list to exactly one category:

| Category | Meaning | Action |
|---|---|---|
| Tautology | Restates what the code, identifier, type, test or `GLOSSARY.md` already says | Delete |
| Stale | Describes code, behaviour or state that no longer exists | Delete |
| Excuse | Justifies a shortcut: a workaround for a bug elsewhere, "never happens in practice", a leftover limit, a timing guess, a placeholder value, a swallowed error or a tool-silencing directive | Delete and file an issue |
| Decision record | Explains a choice, constraint or measured fact that shaped the code and cannot be inferred from reading it | Delete and record in an ADR |

Edge cases:

- **Tautology or decision?** If a reader with the code, tests and glossary would reach the same conclusion unaided, it is a tautology.
- **Stale comment over live code?** If the comment is stale because dead code or config should have been removed alongside it, treat it as an excuse and file an issue.
- **Excuse that the design now relies on?** Record both: an issue to remove the workaround and an ADR explaining what depends on it.
- **Domain term?** If the comment defines a project term, add it to `GLOSSARY.md` (or `docs/acquiring/GLOSSARY.md`) instead of an ADR.

## Procedure

1. **List and count.** Run:
   ```sh
   node tools/oxlint/prosody/comments.ts list > <scratch file>
   node tools/oxlint/prosody/comments.ts count
   ```
   `list` outputs `file:line<TAB>text`. Save the line count from `count` for your final report.

2. **Triage every line.** Assign one category from the table above to every entry in the list. Read the surrounding code whenever the comment text alone is ambiguous. Do not move on until every entry is categorised.

3. **File issues for excuses.** Create one issue per hack (not one per comment) at `docs/issues/NNNN-slug.md` using the next free number. Check existing files in `docs/issues/` first and append to an existing issue if it covers the same hack. Include:
   - A heading stating the problem.
   - `**Where**:` the file and symbol.
   - What the comment excused.
   - `**To fix**:` what removing the hack requires.

4. **Write ADRs for decisions.** Create one ADR per decision (multiple comments often belong to one decision) at `docs/adr/NNNN-slug.md` using the next free number. Check existing files in `docs/adr/` first and extend one if it already covers the decision. Include a heading stating the decision followed by one to five sentences giving the context, the decision and the rationale.

5. **Strip, format and pass checks.** Run:
   ```sh
   node tools/oxlint/prosody/comments.ts strip
   pnpm exec oxfmt
   pnpm check
   ```
   Removing a directive will re-expose the error it suppressed. Fix the underlying code or config until `pnpm check` passes.

6. **Verify the diff.** Run `git diff --numstat` on code files. Aside from formatter reflows and fixes for newly exposed errors, the diff should contain only deletions. Inspect every added line.

7. **Report.** State how many comments were read, the breakdown by category, which issues were filed or updated, which ADRs were written or extended, and how many lines were removed.

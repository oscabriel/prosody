---
name: delete-comment
description: Sort every code comment into tautology, stale, excuse or decision record, then delete them all, filing an issue for each excuse and an ADR for each decision.
disable-model-invocation: true
---

# Delete comment

Code in this repository carries no comments. What a comment knew goes where it can be kept true: a decision in an ADR, a hack in an issue, a word in `GLOSSARY.md`. Run this when comments have crept back in.

`tools/oxlint/prosody/comments.ts` finds and removes them. Run it with node from the repository's root; give it paths to work on part of the tree. It reads every tracked TypeScript, CSS, HTML, Dockerfile and YAML file, and leaves alone the vendored `tools/oxlint/anti-slop`, the `.env.example` files and the lockfile. It spares nothing else: a directive to a tool (`oxlint-disable`, `@ts-expect-error`, `/// <reference>`) is a comment too.

`pnpm check` fails while any comment remains: the lint rule `prosody/no-comments` reports each one in TypeScript, and `pnpm comments` catches what a disable directive hides and what lint does not read.

## Steps

1. **List.** `node tools/oxlint/prosody/comments.ts list > <scratch file>` writes every comment as `file:line<TAB>text`, and `count` says how many lines they take. Keep the count: it is the number you report at the end.
2. **Sort.** Give every comment in the list exactly one category from the table below. Read the code beside a comment whenever its text alone does not settle it. Done when no line of the list is without a category.
3. **File an issue for each excuse.** One per hack, not per comment, as `docs/issues/NNNN-slug.md` under the next free number: a title that states the problem, **Where** (the file and symbol), what the comment excused, and **To fix**. Read the issues already there first, and add to one that covers the same hack.
4. **Record each decision.** One ADR per decision, as `docs/adr/NNNN-slug.md` under the next free number: a title that states the decision, then one to five sentences giving the context, the decision and why. Several comments usually record one decision between them. Read the ADRs already there first, and extend the one that holds the decision.
5. **Strip.** `node tools/oxlint/prosody/comments.ts strip`, then `pnpm exec oxfmt`, then `pnpm check`. Stripping a directive brings back the error it silenced: fix the code, or the setting, until the check passes. Done when it does.
6. **Prove only comments went.** `git diff --numstat` on the code should show deletions alone, apart from lines the formatter reflowed; read every added line.
7. **Report.** How many comments were read, how many fell in each category, the issues filed, the ADRs written or extended, and the lines shed.

## Categories

| Category | It is | Do |
|---|---|---|
| Tautology | What the code, a name, a type or a test beside it already says, or a definition `GLOSSARY.md` holds | Delete |
| Stale | True of code, behaviour or stored state that is no longer there | Delete |
| Excuse | Why a shortcut is acceptable: a workaround for a bug elsewhere, "never happens in practice", a limit left in, a guess at timing, a stand-in value, a failure swallowed, a directive that silences a tool | Delete, and file an issue |
| Decision record | A choice, a constraint or a measured fact that shaped the code and cannot be read from it: why this way and not the obvious one | Delete, and write it into an ADR |

- **Tautology or decision?** Ask whether a reader with the code, its tests and the glossary would reach it unaided. If so it is a tautology.
- **Stale comment over live code?** When what makes a comment stale is code or configuration that should have gone with it, that is an excuse: file the issue.
- **Excuse that also decided something?** A workaround the design now leans on gets both: an issue to remove it, and an ADR that says what leans on it.
- **A word, not a decision?** A comment that defines one of the project's words belongs in `GLOSSARY.md`; add the word there if it is missing.

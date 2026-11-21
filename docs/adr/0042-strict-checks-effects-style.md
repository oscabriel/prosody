# The checks are strict, and Effect's style wins

Lint has three layers: Ultracite's presets, Effect's own rules, and a copy of anti-slop, with warnings denied so every rule is an error or off. Where Effect's style and Ultracite's disagree, Effect's wins. Inside an Effect the code uses what Effect provides (`Config`, `Clock`, `Schema`, `HttpClient`), so a test can stand in for each. Versions that must move together are pinned once in the pnpm catalog, with one copy of Effect for the whole tree, and two dependencies' install scripts are off because the aligner needs nothing they fetch.

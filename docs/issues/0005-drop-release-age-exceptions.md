# Drop the release-age exceptions for `@effect/tsgo` 0.73.2

**Where**: `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`

pnpm holds a release back for a day, and `@effect/tsgo` 0.73.2 was a few hours short of that when it was installed, so eight exceptions were added. It is long past a day old.

**To fix**: Delete the `minimumReleaseAgeExclude` block and reinstall.

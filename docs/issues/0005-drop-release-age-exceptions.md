# Drop release-age exceptions for `@effect/tsgo` `0.73.2`

**Where:** `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`

## What is wrong

`pnpm-workspace.yaml` contains eight entries under `minimumReleaseAgeExclude` for `@effect/tsgo@0.73.2` and its seven platform packages (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-arm`, `linux-x64`, `win32-arm64`, `win32-x64`). They were added as a temporary bypass when `@effect/tsgo` `0.73.2` was less than a day old so pnpm's release-age guard would allow installing it.

## What it costs

Stale package-specific exceptions remain in `pnpm-workspace.yaml` once the release is past the minimum-release-age window.

## How to fix

Delete the `minimumReleaseAgeExclude` block from `pnpm-workspace.yaml` and run `pnpm install` to confirm it resolves cleanly.

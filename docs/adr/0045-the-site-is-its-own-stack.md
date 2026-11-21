# Deploy the public site from its own Cloudflare stack, separate from the host stack

## Decision

The landing page, documentation and blog live in `packages/site`: a Foldkit app (`@foldkit/vite-plugin` + `@foldkit/markdown`) pre-rendered to static pages (`packages/site/vite.config.ts`) from Markdown files under `packages/site/content/` and hydrated in the browser.

It has its own Alchemy stack in `packages/site/alchemy.run.ts` (`ProsodySite`, using `@alchemy.run/cloudflare` and `Cloudflare.state()`), deployed via `pnpm --filter @prosody/site run deploy` rather than the root `pnpm run deploy`. Its custom domain is read from `PROSODY_SITE_DOMAIN` (falling back to `null` for deploy and `prosody.example.com` for prerender origin when unset). Its copy speaks only of books a reader owns and points to `docs/acquiring/` rather than naming fetching tools.

## Why

A self-hoster deploying Prosody on their own hardware has no reason to publish the project's public website and does not need a Cloudflare account. Keeping `ProsodySite` in a separate stack decouples the public site from every host deploy, and reading `PROSODY_SITE_DOMAIN` from `.env` keeps real domains out of the public repository.

## What breaks if you change this

- Wiring `packages/site` into the root `alchemy.run.ts` forces every self-hoster to configure Cloudflare credentials to run `pnpm run deploy`.
- Hardcoding a real domain in `packages/site/alchemy.run.ts` or `packages/site/vite.config.ts` leaks private/owner host details into the public repository.
- Naming specific fetching tools or trackers in `packages/site/content/` breaks the repository's separation between reader-facing site copy and `docs/acquiring/`.

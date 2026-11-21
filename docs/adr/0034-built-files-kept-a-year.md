# Cache content-hashed web assets for a year and revalidate entry files

## Decision

`servePage` (`packages/server/src/Page.ts`) serves the built web app from `/page` with two caching policies and strict path patterns:

- **Hashed build assets** (`ASSET = /^\/assets\/[\w.-]+$/u`): served with `cache-control: public, max-age=31536000, immutable`.
- **Entry and top-level files** (`TOP = /^\/[\w-]+\.(?:js|webmanifest|png)$/u` for `worker.js`, `manifest.webmanifest`, icons; and `ROUTED = /^\/(?:read\/.*|desk)?$/u` serving `/page/index.html`): served with `cache-control: no-cache`.

Because `ASSET` and `TOP` forbid `/` in the filename segment, no subdirectory traversal or arbitrary file lookup outside `/page` is possible.

## Why

Vite hashes every file under `assets/` by its content, so a filename never changes its bytes and can be cached immutably for a year. `index.html`, `worker.js`, the web manifest and the icons keep fixed URLs across deploys, so `no-cache` forces browsers to revalidate them on the next visit and pick up new deploys promptly.

## What breaks if you change this

- Giving `index.html` or `worker.js` a long `max-age` prevents returning browsers from seeing new deploys and new service worker builds.
- Loosening `ASSET` or `TOP` to accept slashes or `..` weakens path containment in `/page`.
- Adding a new top-level static file in `packages/web/public/` with an extension outside `js`, `webmanifest` or `png` will 404 until `TOP` in `Page.ts` is updated.

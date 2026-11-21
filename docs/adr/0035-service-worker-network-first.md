# Serve app pages and copy files network-first in the service worker, and isolate kept audio under ?kept

## Decision

`packages/web/src/Worker.ts` handles same-origin `GET` requests with four strategies:

1. **App navigations** (`/`, `/desk`, `/read/*`): network-first with a 3-second start timeout (`PATIENCE = 3000`, timing headers only), caching successful responses under `"/"` and falling back to cached `"/"`.
2. **Pre-cached shell assets** (`SHELL`): cache-first.
3. **Kept audio** (`/copies/*?kept`): assembled from 8 MiB cached pieces to answer `Range` requests with HTTP `206` (falling back to the network only if piece 0 is missing). `packages/web/src/Listening.ts` appends `?kept` when `room.isKeptHere` is true.
4. **Other copy files** (`/copies/*` excluding `/audio/`): network-first with the same 3-second timeout, falling back to `caches.match`.

`packages/web/vite.config.ts` builds `Worker.ts` separately into `worker.js` with the built `assets/*` list injected as `SHELL`.

## Why

- Network-first with a 3-second start timeout means online readers always get fresh deploys and updated copies, while a slow or dead connection (such as a phone that still thinks it is online) falls back quickly to cached files. Timing only response start avoids aborting slow downloads once bytes begin arriving.
- Giving kept audio its own `?kept` URL prevents a browser `<audio>` element from mixing byte ranges fetched from the network with byte ranges served from the Cache API under the same URL, which causes media playback errors.
- Injecting the hashed `SHELL` list into `worker.js` changes `worker.js`'s bytes on every build, triggering the browser's service worker update lifecycle automatically.

## What breaks if you change this

- Removing `?kept` and intercepting normal `/copies/.../audio/...` URLs mixes network and cache ranges in the same media element, breaking seeking and playback when toggling online/offline.
- Building `worker.js` without injecting `SHELL` leaves browsers stuck on an old service worker after deploys unless `Worker.ts` itself changed.
- Raising `PATIENCE` significantly makes offline opens feel hung when the device is on a dead network.

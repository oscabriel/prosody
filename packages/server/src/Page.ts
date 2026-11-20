import * as Docker from "@alchemy.run/docker";
import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";

import { fingerprintOf } from "./Source.ts";

/** Where the Api's container keeps the web app's build. */
export const PAGE = "/page";

/**
 * The Api's base image: Bun, and the web app's build, which `pnpm run deploy` makes first. Its tag
 * is a fingerprint of the build and the Dockerfile, so a change to either makes a new image and the
 * Api moves onto it.
 */
export const PageImage = Effect.gen(function* () {
	const build = yield* fingerprintOf([
		"packages/web/dist",
		"packages/web/Dockerfile",
	]);

	return yield* Docker.Image("PageImage", {
		tag: `page-${build}`,
		build: { context: "packages/web" },
	});
});

/** Vite names each built file by its content, so a browser may keep one for a year. */
const FOREVER = "public, max-age=31536000, immutable";

/** The app's own pages: the shelf, a work's reading room, and the desk. */
const ROUTED = /^\/(?:read\/.*|desk)?$/u;

/** A built file: no folders, so nothing outside the build. */
const ASSET = /^\/assets\/[\w.-]+$/u;

/** A file at the top of the build: the service worker, the web manifest and the icons. */
const TOP = /^\/[\w-]+\.(?:js|webmanifest|png)$/u;

/** Whether a path is the web app's: one of its pages, or a file of its build. */
export const isPage = (path: string): boolean =>
	ROUTED.test(path) || ASSET.test(path) || TOP.test(path);

/**
 * Serve the web app. A page it routes itself answers `index.html`, which is never kept, so a deploy
 * reaches the next visit, and so do the files at the top of the build. The hashed files it loads are
 * kept for good.
 */
export const servePage = Effect.gen(function* () {
	const request = yield* HttpServerRequest.HttpServerRequest;
	const path = new URL(request.url, "http://localhost").pathname;

	if (ASSET.test(path)) {
		return yield* HttpServerResponse.file(`${PAGE}${path}`, {
			headers: { "cache-control": FOREVER },
		});
	}

	return yield* HttpServerResponse.file(
		TOP.test(path) ? `${PAGE}${path}` : `${PAGE}/index.html`,
		{
			contentType: path.endsWith(".webmanifest")
				? "application/manifest+json"
				: undefined,
			headers: { "cache-control": "no-cache" },
		}
	);
}).pipe(
	Effect.catchCause(() =>
		Effect.succeed(HttpServerResponse.text("Not Found", { status: 404 }))
	)
);

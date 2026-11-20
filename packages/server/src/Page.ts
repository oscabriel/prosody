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

/** The app's own pages: the shelf, and a work's reading room. */
const ROUTED = /^\/(?:read\/.*)?$/u;

/** A built file: no folders, so nothing outside the build. */
const ASSET = /^\/assets\/[\w.-]+$/u;

/** Whether a path is the web app's: one of its pages, or a file of its build. */
export const isPage = (path: string): boolean =>
	ROUTED.test(path) || ASSET.test(path);

/**
 * Serve the web app. A page it routes itself answers `index.html`, which is never kept, so a deploy
 * reaches the next visit. The files it loads are kept for good.
 */
export const servePage = Effect.gen(function* () {
	const request = yield* HttpServerRequest.HttpServerRequest;
	const path = new URL(request.url, "http://localhost").pathname;

	return ASSET.test(path)
		? yield* HttpServerResponse.file(`${PAGE}${path}`, {
				headers: { "cache-control": FOREVER },
			})
		: yield* HttpServerResponse.file(`${PAGE}/index.html`, {
				headers: { "cache-control": "no-cache" },
			});
}).pipe(
	Effect.catchCause(() =>
		Effect.succeed(HttpServerResponse.text("Not Found", { status: 404 }))
	)
);

import * as Docker from "@alchemy.run/docker";
import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";

import { fingerprintOf } from "./Source.ts";

export const PAGE = "/page";

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

const FOREVER = "public, max-age=31536000, immutable";

const ROUTED = /^\/(?:read\/.*|desk)?$/u;

const ASSET = /^\/assets\/[\w.-]+$/u;

const TOP = /^\/[\w-]+\.(?:js|webmanifest|png)$/u;

export const isPage = (path: string): boolean =>
	ROUTED.test(path) || ASSET.test(path) || TOP.test(path);

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

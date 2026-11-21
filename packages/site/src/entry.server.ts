import { Effect, Option } from "effect";
import { Server } from "foldkit/experimental";
import { fromString } from "foldkit/url";

import { DOCS, docHref, POSTS, postHref } from "./Content.ts";
import { init, routeOf, view } from "./Main.ts";
import { AppRoute, blogRouter, homeRouter } from "./Route.ts";

const ABOUT =
	"Prosody is a self-hosted app for DRM-free ebooks, audiobooks and PDFs. It aligns audiobooks to ebooks sentence by sentence on your own machine and keeps one place per book across your devices.";

const HEAD = [
	`<meta name="description" content="${ABOUT}" />`,
	`<meta property="og:site_name" content="Prosody" />`,
	`<meta property="og:description" content="${ABOUT}" />`,
	`<meta name="color-scheme" content="light dark" />`,
	`<meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)" />`,
	`<meta name="theme-color" content="#2a2722" media="(prefers-color-scheme: dark)" />`,
	`<link rel="icon" href="/icon-192.png" />`,
	`<link rel="apple-touch-icon" href="/icon-180.png" />`,
].join("");

export const renderDocument: Server.DocumentRenderer = (application, assets) =>
	Server.renderDocument(application, assets, { head: HEAD });

export const prerenderPaths: ReadonlyArray<string> = [
	homeRouter(),
	...DOCS.map(docHref),
	blogRouter(),
	...POSTS.map(postHref),
];

const statusOf = (request: Request): number =>
	Option.match(fromString(request.url), {
		onNone: () => 404,
		onSome: (url) => (AppRoute.guards.NotFound(routeOf(url)) ? 404 : 200),
	});

export const renderPage = async (
	request: Request
): Promise<Server.EntryResult> => {
	const application = await Effect.runPromise(
		Server.renderToString({ routing: {}, init, view }, { url: request.url })
	);

	return Server.Rendered(application, { status: statusOf(request) });
};

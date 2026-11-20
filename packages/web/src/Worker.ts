/// <reference lib="webworker" />

// The service worker: it keeps the app on the device, so it opens with no network, and answers for
// the reading copies kept on it.

import { PIECE, pieceOf, rangeOf } from "./OnDevice.ts";

declare const self: ServiceWorkerGlobalScope;

/** The paths of the page, its icon and every built file, written in by the build (`vite.config.ts`). */
declare const SHELL: ReadonlyArray<string>;

/** Where the app is kept on the device. */
const APP = "app";

/**
 * How long the network has to answer before the device does. With a network but no server, a fetch
 * can wait a long time before it fails.
 */
const PATIENCE = 3000;

/**
 * The network's answer, or a failure once it has kept us waiting too long. Only the answer's start
 * is timed: a long body, once begun, is left to come.
 */
const soon = async (network: Promise<Response>): Promise<Response> => {
	const late = Promise.withResolvers<never>();

	const timer = setTimeout(() => {
		late.reject(new Error("The network is slow to answer"));
	}, PATIENCE);

	try {
		return await Promise.race([network, late.promise]);
	} finally {
		clearTimeout(timer);
	}
};

/**
 * The page, from the network while it answers, and as kept when it does not. With nothing kept, it
 * waits for the network after all.
 */
const page = async (request: Request): Promise<Response> => {
	const cache = await caches.open(APP);
	const network = fetch(request);

	try {
		const response = await soon(network);

		if (response.ok) {
			await cache.put("/", response.clone());
		}

		return response;
	} catch {
		return (await cache.match("/")) ?? (await network);
	}
};

/** A built file never changes under its name, so the one kept is as good as the network's. */
const built = async (request: Request): Promise<Response> => {
	const kept = await caches.match(request);

	return kept ?? (await fetch(request));
};

/**
 * A file of a reading copy: from the network while it answers, and from the copy kept on the device
 * when it does not. Not kept, it waits for the network after all.
 */
const copyFile = async (request: Request): Promise<Response> => {
	const network = fetch(request);

	try {
		return await soon(network);
	} catch {
		return (await caches.match(request)) ?? (await network);
	}
};

/**
 * A kept copy's audio, put together from its pieces: the part a range asks for, as the Api would
 * answer it. Its own address (`?kept`) keeps it apart from the network's, since a media element
 * fails when one address gives it bytes from both. Not kept, it comes from the network.
 */
const keptAudio = async (request: Request, path: string): Promise<Response> => {
	const first = await caches.match(pieceOf(path, 0));
	const size = Number(first?.headers.get("content-range")?.split("/")[1]);

	if (first === undefined || !Number.isFinite(size)) {
		return await fetch(path, { headers: request.headers });
	}

	const header = request.headers.get("range");
	const [from, to] = rangeOf(header, size);

	if (from > to) {
		return new Response(null, {
			status: 416,
			headers: { "content-range": `bytes */${size}` },
		});
	}

	const indexes = Array.from(
		{ length: Math.floor(to / PIECE) - Math.floor(from / PIECE) + 1 },
		(_, offset) => Math.floor(from / PIECE) + offset
	);

	const parts = await Promise.all(
		indexes.map(async (index) => {
			const piece = await caches.match(pieceOf(path, index));
			const blob = await piece?.blob();
			const start = index * PIECE;

			return blob?.slice(Math.max(from - start, 0), to - start + 1);
		})
	);

	const found = parts.filter((part) => part !== undefined);

	// A piece is missing, so the copy is not whole.
	if (found.length < parts.length) {
		return Response.error();
	}

	return new Response(new Blob(found), {
		status: header === null ? 200 : 206,
		headers: {
			"accept-ranges": "bytes",
			"content-length": String(to - from + 1),
			"content-range": `bytes ${from}-${to}/${size}`,
			"content-type": first.headers.get("content-type") ?? "audio/mp4",
		},
	});
};

/** Keep the page and every built file, and take over from an older worker at once. */
const install = async (): Promise<void> => {
	const cache = await caches.open(APP);

	await cache.addAll(SHELL);
	await self.skipWaiting();
};

/** Drop what an older build kept, and take over the pages already open. */
const activate = async (): Promise<void> => {
	const cache = await caches.open(APP);
	const current = new Set(SHELL);

	const kept = await cache.keys();

	const old = kept.filter(
		(request) => !current.has(new URL(request.url).pathname)
	);

	await Promise.all(old.map(async (request) => await cache.delete(request)));
	await self.clients.claim();
};

self.addEventListener("install", (event) => {
	event.waitUntil(install());
});

self.addEventListener("activate", (event) => {
	event.waitUntil(activate());
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	const url = new URL(request.url);

	if (request.method !== "GET" || url.origin !== self.location.origin) {
		return;
	}

	// The app's own pages: the shelf, the reading rooms and the desk. Any other address is the Api's.
	if (
		request.mode === "navigate" &&
		(url.pathname === "/" ||
			url.pathname === "/desk" ||
			url.pathname.startsWith("/read/"))
	) {
		event.respondWith(page(request));
	} else if (SHELL.includes(url.pathname)) {
		event.respondWith(built(request));
	} else if (
		url.pathname.startsWith("/copies/") &&
		url.searchParams.has("kept")
	) {
		event.respondWith(keptAudio(request, url.pathname));
	} else if (
		url.pathname.startsWith("/copies/") &&
		!url.pathname.includes("/audio/")
	) {
		event.respondWith(copyFile(request));
	}
});

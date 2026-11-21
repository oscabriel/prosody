import { PIECE, pieceOf, rangeOf } from "./OnDevice.ts";

declare const self: ServiceWorkerGlobalScope;

declare const SHELL: ReadonlyArray<string>;

const APP = "app";

const PATIENCE = 3000;

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

const built = async (request: Request): Promise<Response> => {
	const kept = await caches.match(request);

	return kept ?? (await fetch(request));
};

const copyFile = async (request: Request): Promise<Response> => {
	const network = fetch(request);

	try {
		return await soon(network);
	} catch {
		return (await caches.match(request)) ?? (await network);
	}
};

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

const install = async (): Promise<void> => {
	const cache = await caches.open(APP);

	await cache.addAll(SHELL);
	await self.skipWaiting();
};

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

import { Effect, FileSystem, Option } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";

export const COPIES = "/copies";

const SERVED =
	/^(?:contents\.json|timeline\.json|cover\.jpg|text\/.+|pictures\/[^/]+|audio\/[^/]+)$/u;

const WORK = /^w-[0-9a-f]{12}$/u;

const TYPES = new Map([
	["m4b", "audio/mp4"],
	["m4a", "audio/mp4"],
	["mp3", "audio/mpeg"],
	["xhtml", "application/xhtml+xml"],
]);

const notFound = HttpServerResponse.text("Not Found", { status: 404 });

export const rangeOf = (
	header: string | undefined,
	size: number
): Option.Option<{ readonly offset: number; readonly length: number }> => {
	const match = /^bytes=(?<from>\d*)-(?<to>\d*)$/u.exec(header ?? "");
	const from = match?.groups?.from ?? "";
	const to = match?.groups?.to ?? "";

	if (match === null || (from === "" && to === "")) {
		return Option.none();
	}

	const offset = from === "" ? Math.max(0, size - Number(to)) : Number(from);

	const last =
		from === "" || to === "" ? size - 1 : Math.min(Number(to), size - 1);

	return offset > last
		? Option.none()
		: Option.some({ offset, length: last - offset + 1 });
};

export const serveCopy = Effect.gen(function* () {
	const request = yield* HttpServerRequest.HttpServerRequest;
	const fs = yield* FileSystem.FileSystem;

	const route = decodeURIComponent(
		new URL(request.url, "http://localhost").pathname
	);

	const parts = route.split("/");
	const work = parts[2] ?? "";
	const rest = parts.slice(3);
	const file = rest.join("/");

	if (
		request.method !== "GET" ||
		!WORK.test(work) ||
		!SERVED.test(file) ||
		rest.some((part) => part === "" || part === "." || part === "..")
	) {
		return notFound;
	}

	const path = `${COPIES}/${work}/${file}`;
	const info = yield* fs.stat(path).pipe(Effect.option);

	if (Option.isNone(info) || info.value.type !== "File") {
		return notFound;
	}

	const size = Number(info.value.size);
	const contentType = TYPES.get(file.split(".").at(-1) ?? "");
	const headers = { "accept-ranges": "bytes", "cache-control": "no-cache" };
	const range = rangeOf(request.headers.range, size);

	if (Option.isNone(range)) {
		return yield* HttpServerResponse.file(path, { contentType, headers });
	}

	const { offset, length } = range.value;

	return yield* HttpServerResponse.file(path, {
		contentType,
		status: 206,
		offset,
		bytesToRead: length,
		headers: {
			...headers,
			"content-range": `bytes ${offset}-${offset + length - 1}/${size}`,
		},
	});
}).pipe(Effect.catchCause(() => Effect.succeed(notFound)));

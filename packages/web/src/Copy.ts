import { Contents, Timeline } from "@prosody/domain/Reading/Copy";
import { Effect, Schema } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { Command } from "foldkit";

import { Message } from "./Model.ts";

/**
 * What a reading copy holds: the text and the audio joined, the text alone (no audio), the audio
 * alone (no pages, only chapters), or a book's pages (a picture of each).
 */
export type Kind = "synced" | "text" | "audio" | "pages";

export const kindOf = (contents: Contents): Kind => {
	if (contents.pictures.length > 0) {
		return "pages";
	}

	if (contents.audio === null) {
		return "text";
	}

	return contents.pages.length === 0 ? "audio" : "synced";
};

/** Where a work's reading copy is served from. */
export const copyUrl = (work: string, file: string): string =>
	`/copies/${work}/${file}`;

/**
 * Open a work's reading copy: its contents, and the timeline that joins its text and audio when it
 * has both. A copy with no contents is not made yet, or was made before the reading room had pages
 * to show.
 */
export const OpenCopy = Command.define("OpenCopy", {
	args: { work: Schema.String },
	messages: [Message.OpenedCopy, Message.FoundUnmade, Message.FailedOpenCopy],
	execute: ({ work }) =>
		Effect.gen(function* () {
			const client = yield* HttpClient.HttpClient;
			const response = yield* client.get(copyUrl(work, "contents.json"));

			if (response.status === 404) {
				return Message.FoundUnmade({ work });
			}

			const contents = yield* HttpClientResponse.schemaBodyJson(Contents)(
				yield* HttpClientResponse.filterStatusOk(response)
			);

			const timeline: Timeline =
				kindOf(contents) === "synced"
					? yield* client
							.get(copyUrl(work, "timeline.json"))
							.pipe(
								Effect.flatMap(HttpClientResponse.filterStatusOk),
								Effect.flatMap(HttpClientResponse.schemaBodyJson(Timeline))
							)
					: [];

			return Message.OpenedCopy({ work, contents, timeline });
		}).pipe(
			Effect.catchCause((cause) =>
				Effect.succeed(Message.FailedOpenCopy({ work, reason: String(cause) }))
			)
		),
});

/** Elements that only matter to the book's own reader: the reading room sets its own type. */
const DROPPED = "script, style, link, meta, title";

/**
 * A page's body as markup for the reading room. Every link to a file of the copy (an image, a
 * figure) is made absolute, and links between pages are dropped, since the room turns its own
 * pages.
 */
export const bodyOf = (xhtml: string, base: string): string => {
	const parsed = new DOMParser().parseFromString(
		xhtml,
		"application/xhtml+xml"
	);

	const document =
		parsed.querySelector("parsererror") === null
			? parsed
			: new DOMParser().parseFromString(xhtml, "text/html");

	const body = document.querySelector("body");

	if (body === null) {
		return "";
	}

	for (const element of body.querySelectorAll(DROPPED)) {
		element.remove();
	}

	for (const element of body.querySelectorAll("[src], [href], [*|href]")) {
		for (const name of ["src", "href", "xlink:href"]) {
			const value = element.getAttribute(name);

			if (value === null) {
				continue;
			}

			if (element.localName === "a") {
				element.removeAttribute(name);
			} else {
				element.setAttribute(name, new URL(value, base).pathname);
			}
		}
	}

	return body.innerHTML;
};

/** The files a page shows, such as its pictures, as `bodyOf` leaves their paths. */
export const filesOf = (html: string): ReadonlyArray<string> => {
	const { body } = new DOMParser().parseFromString(html, "text/html");

	return [...body.querySelectorAll("[src], [href], [*|href]")].flatMap(
		(element) =>
			["src", "href", "xlink:href"].flatMap(
				(name) => element.getAttribute(name) ?? []
			)
	);
};

/** Fetch one page of a work's reading copy, ready to show. */
export const FetchPage = Command.define("FetchPage", {
	args: { work: Schema.String, path: Schema.String },
	messages: [Message.FetchedPage, Message.FailedFetchPage],
	execute: ({ work, path }) =>
		Effect.gen(function* () {
			const client = yield* HttpClient.HttpClient;
			const url = copyUrl(work, `text/${path}`);

			const xhtml = yield* client.get(url).pipe(
				Effect.flatMap(HttpClientResponse.filterStatusOk),
				Effect.flatMap((response) => response.text)
			);

			return Message.FetchedPage({
				work,
				path,
				html: bodyOf(xhtml, new URL(url, location.origin).href),
			});
		}).pipe(
			Effect.catchCause((cause) =>
				Effect.succeed(
					Message.FailedFetchPage({ work, path, reason: String(cause) })
				)
			)
		),
});

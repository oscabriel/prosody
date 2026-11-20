import { Contents, Timeline } from "@prosody/domain/Reading/Copy";
import { Effect, Schema } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { Command } from "foldkit";

import { Message } from "./Model.ts";

/** Where a work's reading copy is served from. */
export const copyUrl = (work: string, file: string): string =>
	`/copies/${work}/${file}`;

/**
 * Open a work's reading copy: its contents and its timeline. A copy with no contents was made
 * before the reading room had pages to show.
 */
export const OpenBook = Command.define("OpenBook", {
	args: { work: Schema.String },
	messages: [Message.OpenedBook, Message.FoundUnmade, Message.FailedOpenBook],
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

			const timeline = yield* client
				.get(copyUrl(work, "timeline.json"))
				.pipe(
					Effect.flatMap(HttpClientResponse.filterStatusOk),
					Effect.flatMap(HttpClientResponse.schemaBodyJson(Timeline))
				);

			return Message.OpenedBook({ work, contents, timeline });
		}).pipe(
			Effect.catchCause((cause) =>
				Effect.succeed(Message.FailedOpenBook({ work, reason: String(cause) }))
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

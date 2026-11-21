import { Contents, Timeline } from "@prosody/domain/Reading/Copy";
import { Effect, Schema } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { Command } from "foldkit";

import { Message } from "./Model.ts";

export type Kind = "synced" | "text" | "audio" | "pages";

export const kindOf = (contents: Contents): Kind => {
	if (contents.pictures.length > 0) {
		return "pages";
	}

	if (contents.audio === null) {
		return "text";
	}

	return contents.sections.length === 0 ? "audio" : "synced";
};

export const copyUrl = (work: string, file: string): string =>
	`/copies/${work}/${file}`;

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

const DROPPED = "script, style, link, meta, title";

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

export const filesOf = (html: string): ReadonlyArray<string> => {
	const { body } = new DOMParser().parseFromString(html, "text/html");

	return [...body.querySelectorAll("[src], [href], [*|href]")].flatMap(
		(element) =>
			["src", "href", "xlink:href"].flatMap(
				(name) => element.getAttribute(name) ?? []
			)
	);
};

export const FetchSection = Command.define("FetchSection", {
	args: { work: Schema.String, path: Schema.String },
	messages: [Message.FetchedSection, Message.FailedFetchSection],
	execute: ({ work, path }) =>
		Effect.gen(function* () {
			const client = yield* HttpClient.HttpClient;
			const url = copyUrl(work, `text/${path}`);

			const xhtml = yield* client.get(url).pipe(
				Effect.flatMap(HttpClientResponse.filterStatusOk),
				Effect.flatMap((response) => response.text)
			);

			return Message.FetchedSection({
				work,
				path,
				html: bodyOf(xhtml, new URL(url, location.origin).href),
			});
		}).pipe(
			Effect.catchCause((cause) =>
				Effect.succeed(
					Message.FailedFetchSection({ work, path, reason: String(cause) })
				)
			)
		),
});

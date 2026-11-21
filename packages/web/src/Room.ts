import type { Contents } from "@prosody/domain/Reading/Copy";
import { Option } from "effect";
import type { Document, Html, HtmlBuilder } from "foldkit/html";

import { copyUrl, kindOf } from "./Copy.ts";
import { bookView, offlineView } from "./Layout.ts";
import { listeningView, playerView } from "./Listening.ts";
import { Book, Message, Section } from "./Model.ts";
import type { Model, Room } from "./Model.ts";
import { standingView, copyView } from "./Moves.ts";
import { pagesView } from "./Pages.ts";
import { copyFailureOf, isAlone } from "./Rooms.ts";
import { chapterOf, chaptersIn, entryOf, titleOf } from "./Steps.ts";
import { Read } from "./Text.ts";
import { sectionOf, spanOf } from "./Timeline.ts";

const chaptersView = (
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): Html => {
	const current = chapterOf(room, contents);

	const shown = ["audio", "pages"].includes(kindOf(contents))
		? current
		: room.shown;

	return h.ol(
		[h.Class("chapters")],
		chaptersIn(contents).map((_chapter, index) =>
			h.keyed("li")(
				String(index),
				[
					h.Class(
						[
							index < current ? "done" : "",
							index === current ? "current" : "",
							index === shown ? "shown" : "",
						].join(" ")
					),
				],
				[
					h.button(
						[
							h.Type("button"),
							h.OnClick(Message.ClickedChapter({ index })),
							h.AriaCurrent(index === current ? "location" : "false"),
						],
						[titleOf(contents, index)]
					),
				]
			)
		)
	);
};

const leafCoverView = (
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	if (contents.cover === null || kindOf(contents) === "audio") {
		return [];
	}

	return [
		h.img([
			h.Class("leaf-cover"),
			h.Src(copyUrl(room.work, contents.cover)),
			h.Alt(""),
		]),
	];
};

const againView = (
	model: Model,
	room: Room,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	model.isOnline && Book.guards.Open(room.book) && !isAlone(model, room.work)
		? [
				h.details(
					[h.Class("again")],
					[
						h.summary([h.Class("label")], ["Synced"]),
						h.p(
							[],
							[
								"Aligning it again takes a minute or two for a book the press has heard before. The book closes here until it is done.",
							]
						),
						h.button(
							[h.Type("button"), h.OnClick(Message.ClickedRealign())],
							["Align it again"]
						),
					]
				),
			]
		: [];

const leafView = (model: Model, room: Room, h: HtmlBuilder<Message>) => {
	const entry = Option.getOrUndefined(entryOf(model, room.work));

	const heading = [
		...offlineView(model, h),
		h.p([h.Class("book-title")], [entry?.title ?? ""]),
		h.p([h.Class("book-author")], [entry?.author ?? ""]),
		...standingView(model, room, h),
		...copyView(model, room, h),
		...againView(model, room, h),
	];

	return Book.match(room.book, {
		Open: ({ contents }) => [
			...leafCoverView(room, contents, h),
			...heading,
			h.nav(
				[h.Class("toc wide"), h.AriaLabel("Contents")],
				[h.p([h.Class("label")], ["Contents"]), chaptersView(room, contents, h)]
			),
			h.details(
				[h.Class("toc narrow")],
				[
					h.summary([h.Class("label")], ["Contents"]),
					chaptersView(room, contents, h),
				]
			),
		],
		Opening: () => heading,
		Unmade: () => heading,
		Failed: () => heading,
	});
};

const markView = (room: Room, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
	Option.match(room.sentence, {
		onNone: () => [],
		onSome: (sentence) => {
			const id = spanOf(sentence).replaceAll(/[^\w-]/gu, "");
			const block = `.text *:has(> [id="${id}"])`;

			return [
				h.style(
					[],
					[
						`.text [id="${id}"] { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.18em; }`,
						`${block} { position: relative; }`,
						`${block}::before { content: "☞"; position: absolute; left: -1.6em; }`,
					]
				),
			];
		},
	});

const turnsView = (
	current: number,
	contents: Contents,
	h: HtmlBuilder<Message>
): Html => {
	const turns: Array<Html> = [];
	const next = current + 1;
	const previous = current - 1;

	if (next < chaptersIn(contents).length) {
		turns.push(
			h.button(
				[
					h.Type("button"),
					h.Class("turn"),
					h.OnClick(Message.ClickedChapter({ index: next })),
				],
				[
					h.span([h.Class("label")], ["Turn to "]),
					`${titleOf(contents, next)} →`,
				]
			)
		);
	}

	if (previous >= 0) {
		turns.push(
			h.button(
				[
					h.Type("button"),
					h.Class("turn back"),
					h.OnClick(Message.ClickedChapter({ index: previous })),
				],
				[
					h.span([h.Class("label")], ["Turn back to "]),
					titleOf(contents, previous),
				]
			)
		);
	}

	return h.nav([h.Class("turns")], turns);
};

const textView = (
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): Html => {
	const path = contents.sections[room.shown]?.path ?? "";
	const section = room.sections[path] ?? Section.Fetching();

	return Section.match(section, {
		Fetching: () => h.p([h.Class("label status")], ["Turning the page"]),
		Failed: ({ reason }) =>
			h.p([h.Class("status")], [`This page could not be fetched: ${reason}`]),
		Fetched: ({ html }) =>
			h.keyed("article")(
				path,
				[
					h.Class("text"),
					h.DataAttribute(
						"sentence",
						Option.match(
							Option.filter(room.sentence, (s) => sectionOf(s) === path),
							{ onNone: () => "", onSome: spanOf }
						)
					),
					h.InnerHTML(html),
					h.OnMount(Read()),
				],
				[]
			),
	});
};

const elsewhereView = (
	room: Room,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	Option.match(room.elsewhere, {
		onNone: () => [],
		onSome: (place) => [
			h.button(
				[
					h.Type("button"),
					h.Class("turn elsewhere"),
					h.OnClick(Message.ClickedElsewhere()),
				],
				[
					h.span([h.Class("label")], ["Turn to "]),
					`where you were on ${place.device} →`,
				]
			),
		],
	});

const unmadeWords = (alone: boolean, failure: Option.Option<string>) =>
	alone
		? {
				idle: Option.match(failure, {
					onNone: () => "The press has not made this book's reading copy.",
					onSome: (reason) =>
						`The press could not make this book's reading copy: ${reason}.`,
				}),
				button: "Make it now →",
				asked: "Asked the press to make it.",
				aligning:
					"The press is making its reading copy. The book opens here when it is done.",
			}
		: {
				idle: Option.match(failure, {
					onNone: () =>
						"This reading copy was made before the reading room, so it has no pages to show yet. Aligning it again makes them, and takes a minute or two for a book the press has heard before.",
					onSome: (reason) => `The press could not sync this book: ${reason}.`,
				}),
				button: "Align it again →",
				asked: "Asked the press to align it again.",
				aligning:
					"The press is aligning it. The book opens here when it is done.",
			};

const unmadeView = (
	phase: "idle" | "asked" | "aligning",
	alone: boolean,
	failure: Option.Option<string>,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const words = unmadeWords(alone, failure);

	if (phase === "idle") {
		return [
			h.p([], [words.idle]),
			h.button(
				[
					h.Type("button"),
					h.Class("turn"),
					h.OnClick(Message.ClickedRealign()),
				],
				[words.button]
			),
		];
	}

	return [h.p([h.Class("status")], [words[phase]])];
};

export const roomView = (
	model: Model,
	room: Room,
	h: HtmlBuilder<Message>
): Document => {
	const title = Option.match(entryOf(model, room.work), {
		onNone: () => "Prosody",
		onSome: (entry) => entry.title,
	});

	const page = Book.match(room.book, {
		Opening: () => [h.p([h.Class("label status")], ["Opening the book"])],
		Failed: ({ reason }) => [
			h.p(
				[h.Class("status")],
				[
					model.isOnline
						? `This book could not be opened: ${reason}`
						: "You are offline, and this book is not kept on this device. It opens here when you are back.",
				]
			),
		],
		Unmade: ({ phase }) =>
			unmadeView(
				phase,
				isAlone(model, room.work),
				copyFailureOf(model, room.work),
				h
			),
		Open: ({ contents, timeline }) => {
			const player = playerView(room, contents, timeline, h);

			if (kindOf(contents) === "pages") {
				return [...elsewhereView(room, h), ...pagesView(room, contents, h)];
			}

			if (kindOf(contents) === "audio") {
				return [
					...elsewhereView(room, h),
					...listeningView(room, contents, h),
					turnsView(chapterOf(room, contents), contents, h),
					...player,
				];
			}

			return [
				...elsewhereView(room, h),
				h.p([h.Class("label chapter")], [titleOf(contents, room.shown)]),
				textView(room, contents, h),
				turnsView(room.shown, contents, h),
				...player,
				...markView(room, h),
			];
		},
	});

	return {
		title,
		body: bookView(h, leafView(model, room, h), page),
	};
};

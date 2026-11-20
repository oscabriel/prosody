import type { Contents } from "@prosody/domain/Reading/Copy";
import { Option } from "effect";
import type { Document, Html, HtmlBuilder } from "foldkit/html";

import { copyUrl, kindOf } from "./Copy.ts";
import { bookView, offlineView } from "./Layout.ts";
import { listeningView, playerView } from "./Listening.ts";
import { Book, Message, Page } from "./Model.ts";
import type { Model, Room } from "./Model.ts";
import { bedsideView, copyView } from "./Moves.ts";
import { copyFailureOf, isAlone } from "./Rooms.ts";
import { chapterOf, chaptersIn, entryOf, titleOf } from "./Steps.ts";
import { Read } from "./Text.ts";
import { pageOf, spanOf } from "./Timeline.ts";

/**
 * The contents, on the leaf: a manicule at the chapter you are in, and the chapters before it
 * dimmed. Each turns the page to it, or in audio alone, plays from it.
 */
const chaptersView = (
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): Html => {
	const current = chapterOf(room, contents);
	const shown = kindOf(contents) === "audio" ? current : room.shown;

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

/** A text's cover, above its title on the leaf. Audio alone shows its cover on the page. */
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

/** The leaf: the book's title and author, then its contents, folded away on a phone. */
const leafView = (model: Model, room: Room, h: HtmlBuilder<Message>) => {
	const entry = Option.getOrUndefined(entryOf(model, room.work));

	const heading = [
		...offlineView(model, h),
		h.p([h.Class("book-title")], [entry?.title ?? ""]),
		h.p([h.Class("book-author")], [entry?.author ?? ""]),
		...bedsideView(model, room, h),
		...copyView(model, room, h),
	];

	return Book.match(room.book, {
		// Two copies of the contents: always open beside the page, folded above it on a phone. A text
		// shows its cover above its title; audio alone shows it on the page.
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

/** The underline under your sentence and the manicule beside its paragraph, as a style rule. */
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

/**
 * "Turn to" the chapter after `current` and "turn back to" the one before, at the foot of the
 * page.
 */
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

/** The page on show: its text, marked with your place, or why it is not there yet. */
const textView = (
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): Html => {
	const path = contents.pages[room.shown]?.path ?? "";
	const page = room.pages[path] ?? Page.Fetching();

	return Page.match(page, {
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
							Option.filter(room.sentence, (s) => pageOf(s) === path),
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

/** A newer place from another device, offered as a line to follow. */
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

/** What a room says while its copy is not there, for an edition alone or for a pair. */
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
				idle: "This reading copy was made before the reading room, so it has no pages to show yet. Aligning it again makes them, and takes a minute or two for a book the press has heard before.",
				button: "Align it again →",
				asked: "Asked the press to align it again.",
				aligning:
					"The press is aligning it. The book opens here when it is done.",
			};

/** Why a book will not open, and what can be done. */
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

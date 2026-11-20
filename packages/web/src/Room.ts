import type { Contents, Timeline } from "@prosody/domain/Reading/Copy";
import { Option } from "effect";
import type { Document, Html, HtmlBuilder } from "foldkit/html";

import { copyUrl } from "./Copy.ts";
import { bookView, offlineView } from "./Layout.ts";
import { Book, Message, Page } from "./Model.ts";
import type { Model, Room } from "./Model.ts";
import { bedsideView, copyView } from "./Moves.ts";
import { Listen, PLAYER } from "./Player.ts";
import { chapterOf, entryOf, titleOf } from "./Steps.ts";
import { Read } from "./Text.ts";
import { heardOf, leftOnPage, pageOf, spanOf } from "./Timeline.ts";

/**
 * The contents, on the leaf: a manicule at the chapter you are in, and the chapters before it
 * dimmed. Each turns the page to it.
 */
const chaptersView = (
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): Html => {
	const current = chapterOf(room, contents);

	return h.ol(
		[h.Class("chapters")],
		contents.pages.map((page, index) =>
			h.keyed("li")(
				page.path,
				[
					h.Class(
						[
							index < current ? "done" : "",
							index === current ? "current" : "",
							index === room.shown ? "shown" : "",
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
		// Two copies of the contents: always open beside the page, folded above it on a phone.
		Open: ({ contents }) => [
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

/** Minutes, said the way a reader would. */
const minutes = (seconds: number): string => {
	const whole = Math.round(seconds / 60);

	if (whole < 1) {
		return "under a minute";
	}

	return whole === 1 ? "1 minute" : `${whole} minutes`;
};

/** The player at the foot of the page: play or pause, the speed, and the time left in the chapter. */
const playerView = (
	room: Room,
	contents: Contents,
	timeline: Timeline,
	h: HtmlBuilder<Message>
): Html => {
	const chapter = contents.pages[chapterOf(room, contents)]?.path ?? "";
	const left = leftOnPage(heardOf(timeline), chapter, room.time) / room.rate;

	return h.div(
		[h.Class("player")],
		[
			h.audio(
				[
					h.Id(PLAYER),
					h.Src(
						copyUrl(
							room.work,
							`audio/${encodeURIComponent(contents.audio)}${room.isKeptHere ? "?kept" : ""}`
						)
					),
					h.Preload("metadata"),
					h.OnMount(Listen()),
				],
				[]
			),
			h.button(
				[
					h.Type("button"),
					h.Class("play"),
					h.OnClick(
						room.isPlaying ? Message.ClickedPause() : Message.ClickedPlay()
					),
				],
				[room.isPlaying ? "Pause" : "Listen"]
			),
			h.button(
				[
					h.Type("button"),
					h.Class("rate"),
					h.AriaLabel("Speed"),
					h.OnClick(Message.ClickedRate()),
				],
				[`${room.rate}×`]
			),
			h.span(
				[h.Class("left")],
				[left > 0 ? `${minutes(left)} left in the chapter` : ""]
			),
		]
	);
};

/** "Turn to" the next chapter and "turn back to" the one before, at the foot of the page. */
const turnsView = (
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): Html => {
	const turns: Array<Html> = [];
	const next = room.shown + 1;
	const previous = room.shown - 1;

	if (next < contents.pages.length) {
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

/** Why a book will not open, and what can be done. */
const unmadeView = (
	phase: "idle" | "asked" | "aligning",
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	if (phase === "idle") {
		return [
			h.p(
				[],
				[
					"This reading copy was made before the reading room, so it has no pages to show yet. Aligning it again makes them, and takes a minute or two for a book the press has heard before.",
				]
			),
			h.button(
				[
					h.Type("button"),
					h.Class("turn"),
					h.OnClick(Message.ClickedRealign()),
				],
				["Align it again →"]
			),
		];
	}

	return [
		h.p(
			[h.Class("status")],
			[
				phase === "asked"
					? "Asked the press to align it again."
					: "The press is aligning it. The book opens here when it is done.",
			]
		),
	];
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
		Unmade: ({ phase }) => unmadeView(phase, h),
		Open: ({ contents, timeline }) => [
			...elsewhereView(room, h),
			h.p([h.Class("label chapter")], [titleOf(contents, room.shown)]),
			textView(room, contents, h),
			turnsView(room, contents, h),
			playerView(room, contents, timeline, h),
			...markView(room, h),
		],
	});

	return {
		title,
		body: bookView(h, leafView(model, room, h), page),
	};
};

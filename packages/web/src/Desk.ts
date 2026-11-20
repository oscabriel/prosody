import type { Release } from "@prosody/domain/Acquisition/Release";
import type {
	Catalogued,
	WantedBook,
} from "@prosody/domain/Acquisition/Wanted.view";
import type { Recording } from "@prosody/domain/Library/Metadata.external";
import { Option } from "effect";
import type { Document, Html, HtmlBuilder } from "foldkit/html";

import { Message } from "./Model.ts";
import type { Model } from "./Model.ts";
import { dayOf } from "./Nightstand.ts";
import { sizeIn } from "./OnDevice.ts";
import { shelfRouter } from "./Route.ts";

// The desk: the books you want, and what the trackers offer of each. A tool, so it gets the plain
// treatment: the same tokens, a sans face, no leaf.

/** A length of audio as a listener says it: 16 h 10 min. */
const lengthOf = (minutes: number): string =>
	minutes < 60
		? `${minutes} min`
		: `${Math.floor(minutes / 60)} h ${minutes % 60} min`;

/** A day with its year: 4 May 2021. */
const dateOf = (iso: string): string =>
	new Date(iso).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});

/** A link to a work's page on Open Library, after its byline. */
const openLibraryView = (
	openLibrary: string | null,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html | string> =>
	openLibrary === null
		? []
		: [
				" · ",
				h.a(
					[
						h.Class("inline"),
						h.Href(`https://openlibrary.org/works/${openLibrary}`),
						h.Target("_blank"),
						h.Rel("noreferrer"),
					],
					["Open Library"]
				),
			];

/** The line under a book: its author, the year it was first published, and its Open Library page. */
const bylineView = (
	book: WantedBook,
	catalogued: Option.Option<Catalogued>,
	h: HtmlBuilder<Message>
): Html =>
	Option.match(catalogued, {
		onNone: () => h.p([h.Class("byline")], [book.author]),
		onSome: ({ author, description: { year, openLibrary } }) =>
			h.p(
				[h.Class("byline")],
				[
					year === null ? author : `${author}, ${year}`,
					...openLibraryView(openLibrary, h),
				]
			),
	});

/** Why its last search failed, when it did. */
const failureView = (
	book: WantedBook,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	book.state === "failed" ? [h.p([h.Class("note problem")], [book.note])] : [];

/** An audiobook as the catalogues know it: who reads it, how long, and its chapters, when known. */
const recordingOf = ({ narrators, minutes, chapters }: Recording): string => {
	const parts = [
		narrators.length === 0
			? "Audiobook"
			: `Audiobook read by ${narrators.join(", ")}`,
	];

	if (minutes > 0) {
		parts.push(lengthOf(minutes));
	}

	if (chapters.length > 0) {
		parts.push(
			chapters.length === 1 ? "1 chapter" : `${chapters.length} chapters`
		);
	}

	return parts.join(", ");
};

/** What the catalogues say of its audiobook, when there is one. */
const recordingView = (
	catalogued: Option.Option<Catalogued>,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	Option.match(
		Option.flatMapNullishOr(
			catalogued,
			({ description }) => description.recording
		),
		{
			onNone: () => [],
			onSome: (recording) => [h.p([h.Class("note")], [recordingOf(recording)])],
		}
	);

const offerView = (release: Release, h: HtmlBuilder<Message>): Html =>
	h.keyed("li")(
		release.id,
		[h.Class("offer")],
		[
			release.page === null
				? h.span([h.Class("title")], [release.title])
				: h.a(
						[
							h.Class("title"),
							h.Href(release.page),
							h.Target("_blank"),
							h.Rel("noreferrer"),
						],
						[release.title]
					),
			h.p(
				[h.Class("note")],
				[
					[
						release.kind === "audio" ? "Audiobook" : "Ebook",
						sizeIn(release.bytes),
						release.seeders === 1 ? "1 seeder" : `${release.seeders} seeders`,
						dateOf(release.published),
						release.indexer,
					].join(" · "),
				]
			),
		]
	);

/** Where a want's search stands, as a label. */
const stateOf = (book: WantedBook): string => {
	if (book.state === "searching") {
		return "searching";
	}

	if (book.state === "failed") {
		return "search failed";
	}

	return book.offers.length === 1 ? "1 offer" : `${book.offers.length} offers`;
};

const wantView = (
	work: string,
	book: WantedBook,
	catalogued: Option.Option<Catalogued>,
	h: HtmlBuilder<Message>
): Html =>
	h.keyed("li")(
		work,
		[h.Class("want")],
		[
			h.div(
				[h.Class("line")],
				[
					h.h2(
						[h.Class("title")],
						[
							Option.match(catalogued, {
								onNone: () => book.title,
								onSome: ({ title }) => title,
							}),
						]
					),
					h.span([h.Class("label")], [stateOf(book)]),
				]
			),
			bylineView(book, catalogued, h),
			...recordingView(catalogued, h),
			...failureView(book, h),
			h.p(
				[h.Class("moves")],
				[
					`Wanted ${dayOf(book.at)}`,
					h.button(
						[h.Type("button"), h.OnClick(Message.ClickedSearchAgain({ work }))],
						["Search again"]
					),
					h.button(
						[h.Type("button"), h.OnClick(Message.ClickedWithdraw({ work }))],
						["Withdraw"]
					),
				]
			),
			h.ol(
				[h.Class("offers")],
				book.offers.map((release) => offerView(release, h))
			),
		]
	);

const formView = (model: Model, h: HtmlBuilder<Message>): Html =>
	h.form(
		[h.Class("want-form"), h.OnSubmit(Message.SubmittedWant())],
		[
			h.label(
				[h.Class("field")],
				[
					h.span([h.Class("label")], ["Title"]),
					h.input([
						h.Name("title"),
						h.Value(model.desk.title),
						h.Required(true),
						h.Autocomplete("off"),
						h.OnInput((value) => Message.ChangedWantTitle({ value })),
					]),
				]
			),
			h.label(
				[h.Class("field")],
				[
					h.span([h.Class("label")], ["Author"]),
					h.input([
						h.Name("author"),
						h.Value(model.desk.author),
						h.Required(true),
						h.Autocomplete("off"),
						h.OnInput((value) => Message.ChangedWantAuthor({ value })),
					]),
				]
			),
			h.button([h.Type("submit")], ["Want it"]),
		]
	);

const statusOf = (model: Model, count: number): string => {
	if (!model.isOnline) {
		return "Can't reach the desk";
	}

	if (Option.isNone(model.wanted)) {
		return "Opening the desk";
	}

	if (count === 0) {
		return "Nothing wanted yet";
	}

	return count === 1 ? "1 book wanted" : `${count} books wanted`;
};

export const deskView = (model: Model, h: HtmlBuilder<Message>): Document => {
	const wants = Option.match(model.wanted, {
		onNone: () => [],
		onSome: ({ wants: wanted, catalogue }) =>
			Object.entries(wanted)
				.toSorted(([, a], [, b]) => b.at - a.at)
				.map(([work, book]) =>
					wantView(work, book, Option.fromUndefinedOr(catalogue[work]), h)
				),
	});

	return {
		title: "The desk · Prosody",
		body: h.div(
			[h.Class("desk")],
			[
				h.header(
					[h.Class("desk-head")],
					[
						h.a([h.Class("wordmark"), h.Href(shelfRouter())], ["Prosody"]),
						h.a([h.Href(shelfRouter())], ["The shelf"]),
					]
				),
				h.main(
					[h.Class("desk-page")],
					[
						h.h1([], ["The desk"]),
						h.p(
							[h.Class("intro")],
							[
								"Books you want, and the releases Prowlarr finds of each, the most seeded first.",
							]
						),
						formView(model, h),
						...Option.match(model.desk.problem, {
							onNone: () => [],
							onSome: (problem) => [h.p([h.Class("note problem")], [problem])],
						}),
						h.p([h.Class("label status")], [statusOf(model, wants.length)]),
						h.ol([h.Class("wants")], wants),
					]
				),
			]
		),
	};
};

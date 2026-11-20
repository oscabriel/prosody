import type {
	Made,
	ShelfEntry,
	Sync,
} from "@prosody/domain/Library/Shelf.view";
import type { EditionKind } from "@prosody/domain/Library/ShelveEdition.command";
import { COVER } from "@prosody/domain/Reading/Copy";
import { editionToCopy } from "@prosody/domain/Reading/CopyEdition.command";
import { Option } from "effect";
import type { Document, Html, HtmlBuilder } from "foldkit/html";

import { copyUrl } from "./Copy.ts";
import { bookView, offlineView } from "./Layout.ts";
import type { Message, Model } from "./Model.ts";
import { dayOf, readingNow } from "./Nightstand.ts";
import { sizeIn } from "./OnDevice.ts";
import { deskRouter, roomRouter } from "./Route.ts";

/**
 * A work as the shelf lists it: its id, its entry, its sync if it has a pair, and its copy if it
 * has one edition.
 */
interface Listed {
	readonly id: string;
	readonly entry: ShelfEntry;
	readonly sync: Option.Option<Sync>;
	readonly made: Option.Option<Made>;
}

/** The shelf's works with their ids, by author and then title. */
const worksOf = (model: Model): ReadonlyArray<Listed> =>
	Option.match(model.shelf, {
		onNone: () => [],
		onSome: ({ works, syncs, copies }) =>
			Object.entries(works)
				.toSorted(([, a], [, b]) =>
					`${a.author} ${a.title}`.localeCompare(`${b.author} ${b.title}`)
				)
				.map(([id, entry]) => ({
					id,
					entry,
					sync: Option.fromUndefinedOr(syncs[id]),
					made: Option.fromUndefinedOr(copies[id]),
				})),
	});

/** Where a work stands: whether it opens, a label for its kind, and a line that says why. */
interface Standing {
	readonly opens: boolean;
	readonly label: string;
	readonly line: string;
}

/** Whether a work's text and audio are joined. */
const pairOf = (sync: Option.Option<Sync>): Standing =>
	Option.match(sync, {
		onSome: ({ state, note }) => ({
			opens: state === "synced",
			label: { syncing: "syncing", synced: "synced", failed: "not synced" }[
				state
			],
			line: note,
		}),
		onNone: () => ({ opens: false, label: "not paired", line: "" }),
	});

/** What a copy of each edition alone is called, and what it is for once it is made. */
const ALONE = {
	text: { kind: "Text alone", made: "to read" },
	pages: { kind: "Printed pages", made: "to read" },
	audio: { kind: "Audio alone", made: "to hear" },
} as const;

/** Whether a work's one edition has its copy, to read or to hear on its own. */
const aloneOf = (edition: EditionKind, made: Option.Option<Made>): Standing => {
	const { kind } = ALONE[edition];

	return Option.match(made, {
		// A copy that failed opens on why, and the room offers to make it again.
		onSome: ({ state, note }) => ({
			opens: state !== "copying",
			label: {
				copying: "copying",
				made: ALONE[edition].made,
				failed: "not copied",
			}[state],
			line: state === "failed" ? note : `${kind}, ${note}`,
		}),
		onNone: () => ({ opens: false, label: "one edition", line: kind }),
	});
};

/** Where a work stands, by which editions it has. */
const standingOf = ({ entry, sync, made }: Listed): Standing => {
	if (entry.text && entry.audio) {
		return pairOf(sync);
	}

	const alone = editionToCopy((kind) => entry[kind]);

	return alone === undefined
		? { opens: false, label: "no editions", line: "No editions" }
		: aloneOf(alone, made);
};

/**
 * A book's cover beside its entry: the picture over a plain binding that shows the title's first
 * letter, which stays when there is no picture. Only a work with a copy has one to show.
 */
const coverView = (
	work: string,
	title: string,
	hasCopy: boolean,
	h: HtmlBuilder<Message>
): Html => {
	const picture = hasCopy
		? { "--cover": `url("${copyUrl(work, COVER)}")` }
		: {};

	return h.div(
		[h.Class("cover"), h.Style(picture), h.AriaHidden(true)],
		[title.charAt(0)]
	);
};

/** A line under a work kept on this device, saying how much room it takes. */
const keptNote = (
	model: Model,
	work: string,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const copy = model.copies[work];

	return copy === undefined
		? []
		: [h.p([h.Class("note")], [`Kept on this device, ${sizeIn(copy.bytes)}`])];
};

const workView = (
	model: Model,
	listed: Listed,
	h: HtmlBuilder<Message>
): Html => {
	const { id, entry } = listed;
	const { opens, label, line } = standingOf(listed);

	// A work that opens links to its room; the others are listed until they can.
	const title = opens
		? h.a([h.Class("title"), h.Href(roomRouter({ work: id }))], [entry.title])
		: h.span([h.Class("title")], [entry.title]);

	return h.keyed("li")(
		id,
		[h.Class(opens ? "entry opens" : "entry")],
		[
			coverView(id, entry.title, opens, h),
			h.div(
				[h.Class("entry-text")],
				[
					h.div(
						[h.Class("line")],
						[
							title,
							h.span([h.Class("leader")], []),
							h.span([h.Class("label")], [label]),
						]
					),
					h.p([h.Class("byline")], [entry.author]),
					h.p([h.Class("note")], [line]),
					...keptNote(model, id, h),
				]
			),
		]
	);
};

/**
 * What you are reading now, the one read most lately first: each work, and when and where you last
 * read it.
 */
const nightstandView = (
	model: Model,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const works = Option.match(model.shelf, {
		onNone: () => [],
		onSome: ({ works: shelved }) =>
			readingNow(model).flatMap(([id, bedside]) => {
				const entry = shelved[id];

				return entry === undefined ? [] : [{ id, entry, bedside }];
			}),
	});

	if (works.length === 0) {
		return [];
	}

	return [
		h.p([h.Class("label shelf-label")], ["On the nightstand"]),
		h.ol(
			[h.Class("contents nightstand")],
			works.map(({ id, entry, bedside }) =>
				h.keyed("li")(
					id,
					[h.Class("entry")],
					[
						coverView(id, entry.title, true, h),
						h.div(
							[h.Class("entry-text")],
							[
								h.a(
									[h.Class("title"), h.Href(roomRouter({ work: id }))],
									[entry.title]
								),
								h.p([h.Class("byline")], [entry.author]),
								h.p(
									[h.Class("note")],
									[`Last read on ${bedside.device}, ${dayOf(bedside.at)}`]
								),
								...keptNote(model, id, h),
							]
						),
					]
				)
			)
		),
		h.p([h.Class("label shelf-label")], ["Every work"]),
	];
};

/** With no shelf to hand, the books kept on this device, which open with no network. */
const keptView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
	Option.isSome(model.shelf)
		? []
		: Object.entries(model.copies)
				.toSorted(([, a], [, b]) =>
					`${a.author} ${a.title}`.localeCompare(`${b.author} ${b.title}`)
				)
				.map(([id, copy]) =>
					h.keyed("li")(
						id,
						[h.Class("entry")],
						[
							coverView(id, copy.title, true, h),
							h.div(
								[h.Class("entry-text")],
								[
									h.a(
										[h.Class("title"), h.Href(roomRouter({ work: id }))],
										[copy.title]
									),
									h.p([h.Class("byline")], [copy.author]),
									...keptNote(model, id, h),
								]
							),
						]
					)
				);

/** How much this device keeps, under the introduction. */
const keptTotalView = (
	model: Model,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const copies = Object.values(model.copies);

	if (copies.length === 0) {
		return [];
	}

	const bytes = copies.reduce((sum, copy) => sum + copy.bytes, 0);
	const books = copies.length === 1 ? "1 book" : `${copies.length} books`;

	return [
		h.p(
			[h.Class("intro")],
			[`Kept on this device: ${books}, ${sizeIn(bytes)}.`]
		),
	];
};

const statusOf = (model: Model, count: number): string => {
	// Out of reach before the shelf came, as when the page opens with no network.
	if (
		Option.isNone(model.shelf) &&
		(!model.isOnline || Option.isSome(model.error))
	) {
		if (Object.keys(model.copies).length > 0) {
			return "Can't reach the shelf. These are the books kept on this device.";
		}

		return Option.match(model.error, {
			onNone: () => "Can't reach the shelf",
			onSome: (reason) => `Can't reach the shelf: ${reason}`,
		});
	}

	if (Option.isSome(model.error)) {
		return `Can't reach the shelf: ${model.error.value}`;
	}

	if (!model.hasAnswered) {
		return "Opening the shelf";
	}

	if (count === 0) {
		return "Nothing on the shelf yet";
	}

	return count === 1 ? "1 work" : `${count} works`;
};

export const shelfView = (model: Model, h: HtmlBuilder<Message>): Document => {
	const works = worksOf(model);

	return {
		title: "Prosody",
		body: bookView(
			h,
			[
				...offlineView(model, h),
				h.p(
					[h.Class("intro")],
					[
						"Your library. A book with its text and audio joined is synced; one with only its text is there to read, one with only its audio to hear, and one in printed pages to turn. Each opens where you left it, on whichever device you left it.",
					]
				),
				...keptTotalView(model, h),
				h.p(
					[h.Class("intro")],
					[
						"Want a book? Ask at ",
						h.a([h.Class("inline"), h.Href(deskRouter())], ["the desk"]),
						".",
					]
				),
			],
			[
				h.h1([], ["The shelf"]),
				h.p([h.Class("label status")], [statusOf(model, works.length)]),
				...nightstandView(model, h),
				h.ol(
					[h.Class("contents")],
					[
						...works.map((work) => workView(model, work, h)),
						...keptView(model, h),
					]
				),
			]
		),
	};
};

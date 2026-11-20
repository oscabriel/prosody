import type { ShelfEntry, Sync } from "@prosody/domain/Library/Shelf.view";
import { Option } from "effect";
import type { Document, Html, HtmlBuilder } from "foldkit/html";

import { bookView, offlineView } from "./Layout.ts";
import type { Message, Model } from "./Model.ts";
import { dayOf, readingNow } from "./Nightstand.ts";
import { sizeIn } from "./OnDevice.ts";
import { roomRouter } from "./Route.ts";

/** A work as the shelf lists it: its id, its entry, and its sync if it has a pair. */
type Listed = readonly [string, ShelfEntry, Option.Option<Sync>];

/** The shelf's works with their ids, by author and then title. */
const worksOf = (model: Model): ReadonlyArray<Listed> =>
	Option.match(model.shelf, {
		onNone: () => [],
		onSome: ({ works, syncs }) =>
			Object.entries(works)
				.toSorted(([, a], [, b]) =>
					`${a.author} ${a.title}`.localeCompare(`${b.author} ${b.title}`)
				)
				.map(([id, entry]): Listed => [
					id,
					entry,
					Option.fromUndefinedOr(syncs[id]),
				]),
	});

/** Whether a work's text and audio are joined, as a label and a line that says why. */
const syncOf = (entry: ShelfEntry, sync: Option.Option<Sync>) =>
	Option.match(sync, {
		onSome: ({ state, note }) => ({
			state,
			label: { syncing: "syncing", synced: "synced", failed: "not synced" }[
				state
			],
			line: note,
		}),
		onNone: () => ({
			state: "unpaired" as const,
			label: entry.text && entry.audio ? "not paired" : "one edition",
			line:
				entry.text || entry.audio
					? `No ${entry.text ? "audio" : "text"}`
					: "No editions",
		}),
	});

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
	[id, entry, sync]: Listed,
	h: HtmlBuilder<Message>
): Html => {
	const { state, label, line } = syncOf(entry, sync);

	// A synced work opens in the reading room; the others are listed until they can.
	const title =
		state === "synced"
			? h.a([h.Class("title"), h.Href(roomRouter({ work: id }))], [entry.title])
			: h.span([h.Class("title")], [entry.title]);

	return h.keyed("li")(
		id,
		[h.Class(`entry ${state}`)],
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
							h.a(
								[h.Class("title"), h.Href(roomRouter({ work: id }))],
								[copy.title]
							),
							h.p([h.Class("byline")], [copy.author]),
							...keptNote(model, id, h),
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
						"Your library, with each book's text and audio joined. A synced book opens where you left it, on whichever device you left it.",
					]
				),
				...keptTotalView(model, h),
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

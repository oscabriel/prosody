import type { ShelfEntry, Sync } from "@prosody/domain/Library/Shelf.view";
import { Option } from "effect";
import type { Document, Html, HtmlBuilder } from "foldkit/html";

import { bookView } from "./Layout.ts";
import type { Message, Model } from "./Model.ts";
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

const workView = ([id, entry, sync]: Listed, h: HtmlBuilder<Message>): Html => {
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
		]
	);
};

const statusOf = (model: Model, count: number): string => {
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
				h.p(
					[h.Class("intro")],
					[
						"Your library, with each book's text and audio joined. A synced book opens where you left it, on whichever device you left it.",
					]
				),
			],
			[
				h.h1([], ["The shelf"]),
				h.p([h.Class("label status")], [statusOf(model, works.length)]),
				h.ol(
					[h.Class("contents")],
					works.map((work) => workView(work, h))
				),
			]
		),
	};
};

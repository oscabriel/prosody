import * as Domain from "@alchemy.run/domain";
import { DateTime, Effect, Record, Schema } from "effect";

import { Description } from "../Library/Metadata.external.ts";
import { SHELF, ShelfName } from "../Library/Shelf.view.ts";
import { Work } from "../Library/Work.aggregate.ts";
import { Session } from "../Session.middleware.ts";
import { Release } from "./Release.ts";
import { Want } from "./Want.aggregate.ts";

/** What the desk shows of one book you want: how its search went, and what it found. */
export const WantedBook = Schema.Struct({
	/** As you gave them. */
	title: Schema.String,
	author: Schema.String,
	/** When you wanted it, in milliseconds. */
	at: Schema.Finite,
	state: Schema.Literals(["searching", "offered", "failed"]),
	/** Why the last search failed, or nothing. */
	note: Schema.String,
	/** What the last search found. They stay while the next search runs. */
	offers: Schema.Array(Release),
});

export type WantedBook = typeof WantedBook.Type;

/** A wanted book's work, as the catalogues outside know it. */
export const Catalogued = Schema.Struct({
	title: Schema.String,
	author: Schema.String,
	description: Description,
});

export type Catalogued = typeof Catalogued.Type;

const State = Schema.Struct({
	wants: Schema.Record(Schema.String, WantedBook),
	catalogue: Schema.Record(Schema.String, Catalogued),
});

type State = typeof State.Type;

/** The desk with one of its books changed, if it still wants it. */
const changed = (
	desk: State,
	work: string,
	change: (book: WantedBook) => WantedBook
): State => {
	const book = desk.wants[work];

	return book === undefined
		? desk
		: { ...desk, wants: { ...desk.wants, [work]: change(book) } };
};

/**
 * Every book you want, by work id, with its offers, and its work as the catalogues outside know it.
 * The desk watches it, so offers appear as a search finds them. There is one, beside the one shelf.
 * The sources have no order between them, so the catalogue is kept apart and the page joins them.
 * A book withdrawn leaves both.
 */
export class Wanted extends Domain.View("Wanted", {
	from: [Want, Work],
	key: ShelfName,
	middleware: [Session],
	keyOf: { Want: () => SHELF, Work: () => SHELF },
	state: State,
	initial: { wants: {}, catalogue: {} },
	evolve: {
		BookWanted: (desk, e, { source, at }) => ({
			...desk,
			wants: {
				...desk.wants,
				[source.id]: {
					title: e.title,
					author: e.author,
					at: DateTime.toEpochMillis(at),
					state: "searching" as const,
					note: "",
					offers: [],
				},
			},
		}),
		SearchStarted: (desk, _e, { source }) =>
			changed(desk, source.id, (book) => ({
				...book,
				state: "searching" as const,
				note: "",
			})),
		ReleasesOffered: (desk, e, { source }) =>
			changed(desk, source.id, (book) => ({
				...book,
				state: "offered" as const,
				offers: e.releases,
			})),
		SearchFailed: (desk, e, { source }) =>
			changed(desk, source.id, (book) => ({
				...book,
				state: "failed" as const,
				note: e.reason,
			})),
		WantWithdrawn: (desk, _e, { source }) => ({
			wants: Record.remove(desk.wants, source.id),
			catalogue: Record.remove(desk.catalogue, source.id),
		}),
		// Only a work you wanted is described; one the press found is not the desk's.
		WorkCatalogued: (desk, e, { source }) =>
			e.description === null
				? desk
				: {
						...desk,
						catalogue: {
							...desk.catalogue,
							[source.id]: {
								title: e.title,
								author: e.author,
								description: e.description,
							},
						},
					},
	},
}) {}

/** Any of your devices may read the desk; the Session lets in no one else. */
export const WantedLive = Wanted.toLayer(Effect.succeed(() => Effect.void));

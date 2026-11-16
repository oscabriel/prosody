import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Shelfmark } from "./Shelfmark.ts";
import { Work } from "./Work.aggregate.ts";

/** Which shelf. There is one, so there is one key. */
export const ShelfName = Schema.String.pipe(Schema.brand("ShelfName"));

export type ShelfName = typeof ShelfName.Type;

export const SHELF = ShelfName.make("main");

/** What the shelf shows of one work. */
export const ShelfEntry = Schema.Struct({
	title: Schema.String,
	author: Schema.String,
	shelfmark: Shelfmark,
	text: Schema.Boolean,
	audio: Schema.Boolean,
});

export type ShelfEntry = typeof ShelfEntry.Type;

/** Every catalogued work, by id. Each work's events are routed to the one shelf. */
export class Shelf extends Domain.View("Shelf", {
	from: [Work],
	key: ShelfName,
	keyOf: { Work: () => SHELF },
	state: Schema.Struct({ works: Schema.Record(Schema.String, ShelfEntry) }),
	initial: { works: {} },
	evolve: {
		WorkCatalogued: (shelf, e, { source }) => ({
			works: {
				...shelf.works,
				[source.id]: {
					title: e.title,
					author: e.author,
					shelfmark: e.shelfmark,
					text: false,
					audio: false,
				},
			},
		}),
		EditionShelved: (shelf, e, { source }) => {
			const entry = shelf.works[source.id];

			if (entry === undefined) {
				return shelf;
			}

			return {
				works: { ...shelf.works, [source.id]: { ...entry, [e.kind]: true } },
			};
		},
	},
}) {}

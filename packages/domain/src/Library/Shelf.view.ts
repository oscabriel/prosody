import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Narration } from "../Narration/Narration.aggregate.ts";
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

/** How far a paired work's alignment has got, and a line that says why. */
export const Sync = Schema.Struct({
	state: Schema.Literals(["syncing", "synced", "failed"]),
	note: Schema.String,
});

export type Sync = typeof Sync.Type;

/** A share as a whole percentage. */
const percent = (part: number, whole: number) =>
	`${Math.round((100 * part) / Math.max(whole, 1))}%`;

/**
 * Every catalogued work, and every pair's sync, by work id. Each work's and each narration's events
 * are routed to the one shelf. The two sources have no order between them, so a sync is kept apart
 * from its work and the page joins them.
 */
export class Shelf extends Domain.View("Shelf", {
	from: [Work, Narration],
	key: ShelfName,
	keyOf: { Work: () => SHELF, Narration: () => SHELF },
	state: Schema.Struct({
		works: Schema.Record(Schema.String, ShelfEntry),
		syncs: Schema.Record(Schema.String, Sync),
	}),
	initial: { works: {}, syncs: {} },
	// 1: reads the Narration too, and keeps syncs.
	version: 1,
	evolve: {
		WorkCatalogued: (shelf, e, { source }) => ({
			...shelf,
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
				...shelf,
				works: { ...shelf.works, [source.id]: { ...entry, [e.kind]: true } },
			};
		},
		AlignmentStarted: (shelf, e, { source }) => ({
			...shelf,
			syncs: {
				...shelf.syncs,
				[source.id]: {
					state: "syncing" as const,
					note: e.attempt === 1 ? "aligning" : `aligning, try ${e.attempt}`,
				},
			},
		}),
		NarrationAligned: (shelf, e, { source }) => ({
			...shelf,
			syncs: {
				...shelf.syncs,
				[source.id]: {
					state: "synced" as const,
					note: `${percent(e.matched, e.sentences)} of sentences found in the audio; ${e.heard} of ${e.checked} spot checks heard right`,
				},
			},
		}),
		AlignmentFailed: (shelf, e, { source }) => ({
			...shelf,
			syncs: {
				...shelf.syncs,
				[source.id]: { state: "failed" as const, note: e.reason },
			},
		}),
	},
}) {}

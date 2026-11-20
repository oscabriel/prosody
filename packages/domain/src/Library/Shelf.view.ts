import * as Domain from "@alchemy.run/domain";
import { Effect, Schema } from "effect";

import { Narration } from "../Narration/Narration.aggregate.ts";
import { Copy } from "../Reading/Copy.aggregate.ts";
import { Session } from "../Session.middleware.ts";
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

/** How far the reading copy of a work with one edition has got, and a line that says why. */
export const Made = Schema.Struct({
	state: Schema.Literals(["copying", "made", "failed"]),
	note: Schema.String,
});

export type Made = typeof Made.Type;

/** A share as a whole percentage. */
const percent = (part: number, whole: number) =>
	`${Math.round((100 * part) / Math.max(whole, 1))}%`;

/**
 * Every catalogued work, every pair's sync, and the copy of every work with one edition, by work id.
 * Each work's, narration's and copy's events are routed to the one shelf. The sources have no order
 * between them, so syncs and copies are kept apart from their works and the page joins them.
 */
export class Shelf extends Domain.View("Shelf", {
	from: [Work, Narration, Copy],
	key: ShelfName,
	middleware: [Session],
	keyOf: { Work: () => SHELF, Narration: () => SHELF, Copy: () => SHELF },
	state: Schema.Struct({
		works: Schema.Record(Schema.String, ShelfEntry),
		syncs: Schema.Record(Schema.String, Sync),
		// A shelf kept before there were copies has none.
		copies: Schema.Record(Schema.String, Made).pipe(
			Schema.withDecodingDefaultKey(Effect.succeed({}))
		),
	}),
	initial: { works: {}, syncs: {}, copies: {} },
	// 1: reads the Narration too, and keeps syncs. Copies came later with no new version: every copy
	// event is newer than they are, and a new version would rebuild the shelf from no history at all.
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
		CopyStarted: (shelf, e, { source }) => ({
			...shelf,
			copies: {
				...shelf.copies,
				[source.id]: {
					state: "copying" as const,
					note: e.attempt === 1 ? "copying" : `copying, try ${e.attempt}`,
				},
			},
		}),
		CopyMade: (shelf, e, { source }) => ({
			...shelf,
			copies: {
				...shelf.copies,
				[source.id]: {
					state: "made" as const,
					note: e.chapters === 1 ? "1 chapter" : `${e.chapters} chapters`,
				},
			},
		}),
		CopyFailed: (shelf, e, { source }) => ({
			...shelf,
			copies: {
				...shelf.copies,
				[source.id]: { state: "failed" as const, note: e.reason },
			},
		}),
	},
}) {}

/** Any of your devices may read the shelf; the Session lets in no one else. */
export const ShelfLive = Shelf.toLayer(Effect.succeed(() => Effect.void));

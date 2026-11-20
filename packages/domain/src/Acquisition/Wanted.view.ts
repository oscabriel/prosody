import * as Domain from "@alchemy.run/domain";
import { DateTime, Effect, Record, Schema } from "effect";

import { Description } from "../Library/Metadata.external.ts";
import { SHELF, ShelfName } from "../Library/Shelf.view.ts";
import { Work } from "../Library/Work.aggregate.ts";
import { Session } from "../Session.middleware.ts";
import { Grab } from "./Grab.aggregate.ts";
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
	/** The ids of the releases grabbed. A desk kept before grabs has none. */
	grabbed: Schema.Array(Schema.String).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
	),
});

export type WantedBook = typeof WantedBook.Type;

/** A wanted book's work, as the catalogues outside know it. */
export const Catalogued = Schema.Struct({
	title: Schema.String,
	author: Schema.String,
	description: Description,
});

export type Catalogued = typeof Catalogued.Type;

/** What the desk shows of one release you grabbed, from its download to the end of its seeding. */
export const GrabbedRelease = Schema.Struct({
	work: Schema.String,
	/** The book, as the desk named it when the download started. */
	title: Schema.String,
	author: Schema.String,
	release: Release,
	state: Schema.Literals(["downloading", "stalled", "arrived"]),
	percent: Schema.Int,
	/** Why it stalled, or nothing. */
	note: Schema.String,
	/** Whole hours seeded. */
	seeded: Schema.Int,
	/** When its payload came, in milliseconds: the days to seed it in run from then. */
	arrived: Schema.NullOr(Schema.Finite),
});

export type GrabbedRelease = typeof GrabbedRelease.Type;

const State = Schema.Struct({
	wants: Schema.Record(Schema.String, WantedBook),
	catalogue: Schema.Record(Schema.String, Catalogued),
	// A desk kept before grabs has none.
	grabs: Schema.Record(Schema.String, GrabbedRelease).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed({}))
	),
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

/** The desk with one of its grabs changed, if it still shows it. */
const changedGrab = (
	desk: State,
	grab: string,
	change: (grabbed: GrabbedRelease) => GrabbedRelease
): State => {
	const grabbed = desk.grabs[grab];

	return grabbed === undefined
		? desk
		: { ...desk, grabs: { ...desk.grabs, [grab]: change(grabbed) } };
};

/**
 * Every book you want, by work id, with its offers, and its work as the catalogues outside know it,
 * and every release you grabbed, by grab id, until it is released or abandoned. The desk watches it,
 * so offers and downloads move as they happen. There is one, beside the one shelf. The sources have
 * no order between them, so the catalogue and the grabs are kept apart and the page joins them. A
 * book withdrawn leaves its want and its catalogue entry; its grabs stay until they are done.
 */
export class Wanted extends Domain.View("Wanted", {
	from: [Want, Work, Grab],
	key: ShelfName,
	middleware: [Session],
	keyOf: { Want: () => SHELF, Work: () => SHELF, Grab: () => SHELF },
	state: State,
	initial: { wants: {}, catalogue: {}, grabs: {} },
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
					grabbed: [],
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
		ReleaseGrabbed: (desk, e, { source }) =>
			changed(desk, source.id, (book) => ({
				...book,
				grabbed: [...book.grabbed, e.release.id],
			})),
		WantWithdrawn: (desk, _e, { source }) => ({
			...desk,
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
		DownloadStarted: (desk, e, { source }) => {
			const book = desk.catalogue[e.work] ?? desk.wants[e.work];

			return {
				...desk,
				grabs: {
					...desk.grabs,
					[source.id]: {
						work: e.work,
						title: book?.title ?? e.release.title,
						author: book?.author ?? "",
						release: e.release,
						state: "downloading" as const,
						percent: 0,
						note: "",
						seeded: 0,
						arrived: null,
					},
				},
			};
		},
		DownloadProgressed: (desk, e, { source }) =>
			changedGrab(desk, source.id, (grabbed) => ({
				...grabbed,
				state: "downloading" as const,
				percent: e.percent,
				note: "",
			})),
		GrabStalled: (desk, e, { source }) =>
			changedGrab(desk, source.id, (grabbed) => ({
				...grabbed,
				state: "stalled" as const,
				note: e.reason,
			})),
		GrabResumed: (desk, _e, { source }) =>
			changedGrab(desk, source.id, (grabbed) => ({
				...grabbed,
				state: "downloading" as const,
				note: "",
			})),
		GrabAbandoned: (desk, _e, { source }) => ({
			...desk,
			grabs: Record.remove(desk.grabs, source.id),
		}),
		PayloadArrived: (desk, _e, { source, at }) =>
			changedGrab(desk, source.id, (grabbed) => ({
				...grabbed,
				state: "arrived" as const,
				percent: 100,
				note: "",
				arrived: DateTime.toEpochMillis(at),
			})),
		PayloadSeeded: (desk, e, { source }) =>
			changedGrab(desk, source.id, (grabbed) => ({
				...grabbed,
				seeded: e.hours,
			})),
		PayloadReleased: (desk, _e, { source }) => ({
			...desk,
			grabs: Record.remove(desk.grabs, source.id),
		}),
	},
}) {}

/** Any of your devices may read the desk; the Session lets in no one else. */
export const WantedLive = Wanted.toLayer(Effect.succeed(() => Effect.void));

import * as Domain from "@alchemy.run/domain";
import { DateTime, Effect, Record, Schema } from "effect";

import { Description } from "../Library/Metadata.external.ts";
import { SHELF, ShelfName } from "../Library/Shelf.view.ts";
import { Shelfmark } from "../Library/Shelfmark.ts";
import { Work } from "../Library/Work.aggregate.ts";
import { asAdmin, Forbidden, Session } from "../Session.middleware.ts";
import { Grab } from "./Grab.aggregate.ts";
import { Release } from "./Release.ts";
import { Want } from "./Want.aggregate.ts";

export const WantedBook = Schema.Struct({
	title: Schema.String,
	author: Schema.String,
	at: Schema.Finite,
	state: Schema.Literals(["searching", "offered", "failed"]),
	note: Schema.String,
	offers: Schema.Array(Release),
	grabbed: Schema.Array(Schema.String).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
	),
});

export type WantedBook = typeof WantedBook.Type;

export const Catalogued = Schema.Struct({
	title: Schema.String,
	author: Schema.String,
	description: Description,
});

export type Catalogued = typeof Catalogued.Type;

export const GrabbedRelease = Schema.Struct({
	work: Schema.String,
	title: Schema.String,
	author: Schema.String,
	release: Release,
	state: Schema.Literals(["downloading", "stalled", "arrived"]),
	percent: Schema.Int,
	note: Schema.String,
	seeded: Schema.Int,
	arrived: Schema.NullOr(Schema.Finite),
	shelf: Schema.NullOr(
		Schema.Struct({ work: Schema.String, shelfmark: Shelfmark })
	).pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
});

export type GrabbedRelease = typeof GrabbedRelease.Type;

const State = Schema.Struct({
	wants: Schema.Record(Schema.String, WantedBook),
	catalogue: Schema.Record(Schema.String, Catalogued),
	grabs: Schema.Record(Schema.String, GrabbedRelease).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed({}))
	),
});

type State = typeof State.Type;

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

export class Wanted extends Domain.View("Wanted", {
	from: [Want, Work, Grab],
	key: ShelfName,
	middleware: [Session],
	rejects: [Forbidden],
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
		TitleCorrected: (desk, e, { source }) => {
			const catalogued = desk.catalogue[source.id];

			return catalogued === undefined
				? desk
				: {
						...desk,
						catalogue: {
							...desk.catalogue,
							[source.id]: { ...catalogued, title: e.title, author: e.author },
						},
					};
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
						shelf: null,
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
		PayloadShelved: (desk, e, { source }) =>
			changedGrab(desk, source.id, (grabbed) => ({
				...grabbed,
				note: "",
				shelf: { work: e.work, shelfmark: e.shelfmark },
			})),
		PayloadNotShelved: (desk, e, { source }) =>
			changedGrab(desk, source.id, (grabbed) => ({
				...grabbed,
				note: e.reason,
			})),
		PayloadReleased: (desk, _e, { source }) => ({
			...desk,
			grabs: Record.remove(desk.grabs, source.id),
		}),
	},
}) {}

export const judgeWanted = Effect.fn(function* (
	_request: Domain.Read.Request<ShelfName>
) {
	yield* asAdmin;
});

export const WantedLive = Wanted.toLayer(Effect.succeed(judgeWanted));

import * as Domain from "@alchemy.run/domain";
import { Effect, Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { GrabId } from "./Grab.id.ts";
import {
	GrabRelease,
	ReleaseGrabbed,
	ReleaseNotOffered,
} from "./GrabRelease.command.ts";
import { OfferReleases, ReleasesOffered } from "./OfferReleases.command.ts";
import {
	RecordSearchFailed,
	SearchFailed,
} from "./RecordSearchFailed.command.ts";
import { Release } from "./Release.ts";
import { SearchAgain } from "./SearchAgain.command.ts";
import { BookWanted, SearchStarted, WantBook } from "./WantBook.command.ts";
import {
	NotWanted,
	WantWithdrawn,
	WithdrawWant,
} from "./WithdrawWant.command.ts";

const State = Schema.Struct({
	isWanted: Schema.Boolean,
	title: Schema.String,
	author: Schema.String,
	search: Schema.Int,
	/** What the latest search offered. A want kept before grabs has none, and is searched again. */
	offers: Schema.Array(Release).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
	),
	/** The ids of the releases grabbed, in order: the grab of the first is `<work>.1`. */
	grabbed: Schema.Array(Schema.String).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
	),
}).annotate({ identifier: "WantState" });

/** Whether an answer is about the latest search for a book still wanted. */
const isLatest = (want: typeof State.Type, search: number): boolean =>
	want.isWanted && want.search === search;

/**
 * A book you want, keyed by the work it will be. It holds the latest search, and takes the first
 * answer to it. It grabs only what that answer offered.
 */
export class Want extends Domain.Aggregate("Want", {
	id: WorkId,
	state: State,
	initial: {
		isWanted: false,
		title: "",
		author: "",
		search: 0,
		offers: [],
		grabbed: [],
	},
	commands: [
		WantBook,
		WithdrawWant,
		SearchAgain,
		OfferReleases,
		RecordSearchFailed,
		GrabRelease,
	],
	decide: {
		WantBook: (want, cmd) =>
			want.isWanted
				? []
				: [
						new BookWanted({ title: cmd.title, author: cmd.author }),
						new SearchStarted({ search: want.search + 1 }),
					],
		WithdrawWant: (want) =>
			want.isWanted ? [new WantWithdrawn()] : new NotWanted(),
		SearchAgain: (want) =>
			want.isWanted
				? [new SearchStarted({ search: want.search + 1 })]
				: new NotWanted(),
		OfferReleases: (want, cmd) =>
			isLatest(want, cmd.search)
				? [new ReleasesOffered({ releases: cmd.releases })]
				: [],
		RecordSearchFailed: (want, cmd) =>
			isLatest(want, cmd.search)
				? [new SearchFailed({ reason: cmd.reason })]
				: [],
		GrabRelease: (want, cmd, { id: work }) => {
			if (!want.isWanted) {
				return new NotWanted();
			}

			if (want.grabbed.includes(cmd.release)) {
				return [];
			}

			const release = want.offers.find(({ id }) => id === cmd.release);

			if (release === undefined) {
				return new ReleaseNotOffered();
			}

			const grab = GrabId.make(`${work}.${want.grabbed.length + 1}`);

			return [new ReleaseGrabbed({ grab, release })];
		},
	},
	evolve: {
		BookWanted: (want, e) => ({
			...want,
			isWanted: true,
			title: e.title,
			author: e.author,
		}),
		SearchStarted: (want, e) => ({ ...want, search: e.search }),
		ReleasesOffered: (want, e) => ({ ...want, offers: e.releases }),
		SearchFailed: (want) => want,
		WantWithdrawn: (want) => ({ ...want, isWanted: false }),
		ReleaseGrabbed: (want, e) => ({
			...want,
			grabbed: [...want.grabbed, e.release.id],
		}),
	},
}) {}

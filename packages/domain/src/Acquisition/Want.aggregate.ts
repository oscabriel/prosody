import * as Domain from "@alchemy.run/domain";
import { Effect, Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { asAdmin } from "../Session.middleware.ts";
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
	offers: Schema.Array(Release).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
	),
	grabbed: Schema.Array(Schema.String).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
	),
}).annotate({ identifier: "WantState" });

const isLatest = (want: typeof State.Type, search: number): boolean =>
	want.isWanted && want.search === search;

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
		WantBook: Effect.fn(function* (want, cmd) {
			yield* asAdmin;

			return want.isWanted
				? []
				: [
						new BookWanted({ title: cmd.title, author: cmd.author }),
						new SearchStarted({ search: want.search + 1 }),
					];
		}),
		WithdrawWant: Effect.fn(function* (want) {
			yield* asAdmin;

			if (!want.isWanted) {
				return yield* new NotWanted();
			}

			return [new WantWithdrawn()];
		}),
		SearchAgain: Effect.fn(function* (want) {
			yield* asAdmin;

			if (!want.isWanted) {
				return yield* new NotWanted();
			}

			return [new SearchStarted({ search: want.search + 1 })];
		}),
		OfferReleases: (want, cmd) =>
			isLatest(want, cmd.search)
				? [new ReleasesOffered({ releases: cmd.releases })]
				: [],
		RecordSearchFailed: (want, cmd) =>
			isLatest(want, cmd.search)
				? [new SearchFailed({ reason: cmd.reason })]
				: [],
		GrabRelease: Effect.fn(function* (want, cmd, { id: work }) {
			yield* asAdmin;

			if (!want.isWanted) {
				return yield* new NotWanted();
			}

			if (want.grabbed.includes(cmd.release)) {
				return [];
			}

			const release = want.offers.find(({ id }) => id === cmd.release);

			if (release === undefined) {
				return yield* new ReleaseNotOffered();
			}

			const grab = GrabId.make(`${work}.${want.grabbed.length + 1}`);

			return [new ReleaseGrabbed({ grab, release })];
		}),
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

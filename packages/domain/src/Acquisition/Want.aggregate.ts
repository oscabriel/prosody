import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { OfferReleases, ReleasesOffered } from "./OfferReleases.command.ts";
import {
	RecordSearchFailed,
	SearchFailed,
} from "./RecordSearchFailed.command.ts";
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
}).annotate({ identifier: "WantState" });

/** Whether an answer is about the latest search for a book still wanted. */
const isLatest = (want: typeof State.Type, search: number): boolean =>
	want.isWanted && want.search === search;

/**
 * A book you want, keyed by the work it will be. It holds the latest search, and takes the first
 * answer to it.
 */
export class Want extends Domain.Aggregate("Want", {
	id: WorkId,
	state: State,
	initial: { isWanted: false, title: "", author: "", search: 0 },
	commands: [
		WantBook,
		WithdrawWant,
		SearchAgain,
		OfferReleases,
		RecordSearchFailed,
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
	},
	evolve: {
		BookWanted: (want, e) => ({
			...want,
			isWanted: true,
			title: e.title,
			author: e.author,
		}),
		SearchStarted: (want, e) => ({ ...want, search: e.search }),
		ReleasesOffered: (want) => want,
		SearchFailed: (want) => want,
		WantWithdrawn: (want) => ({ ...want, isWanted: false }),
	},
}) {}

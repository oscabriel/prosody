import * as Domain from "@alchemy.run/domain";
import { Effect } from "effect";

import { Indexer } from "./Indexer.external.ts";
import { OfferReleases } from "./OfferReleases.command.ts";
import { RecordSearchFailed } from "./RecordSearchFailed.command.ts";
import { Want } from "./Want.aggregate.ts";
import { SearchStarted } from "./WantBook.command.ts";

/**
 * Whenever a search starts, ask the Indexer for the book and offer what it finds. A search that
 * fails is recorded with its reason, and waits for you to search again.
 */
export class ReleaseSearch extends Domain.Policy(
	"ReleaseSearch",
	{ from: Want, on: [SearchStarted] },
	{ description: "Searches the Indexer for each wanted book." }
) {}

export const ReleaseSearchLive = ReleaseSearch.toLayer(
	Effect.gen(function* () {
		const indexer = yield* Indexer;
		const wants = yield* Want;

		return Effect.fn("ReleaseSearch")(function* ({ source, event }) {
			const { isWanted, title, author } = yield* wants.get(source);

			if (!isWanted) {
				return;
			}

			const answer = yield* indexer.search({ title, author }).pipe(
				Effect.map(
					({ releases }) =>
						new OfferReleases({ search: event.search, releases })
				),
				Effect.catchTag("IndexerFailed", ({ reason }) =>
					Effect.succeed(
						new RecordSearchFailed({ search: event.search, reason })
					)
				)
			);

			yield* wants.send(source, answer);
		});
	})
);

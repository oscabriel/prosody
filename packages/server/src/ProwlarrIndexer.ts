import {
	Indexer,
	IndexerFailed,
} from "@prosody/domain/Acquisition/Indexer.external";
import type { Release } from "@prosody/domain/Acquisition/Release";
import { Config, Effect, Layer, Redacted, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";

/** Prowlarr's own categories for audiobooks and for ebooks. */
const AUDIOBOOKS = 3030;

const EBOOKS = 7020;

/** How many releases of each kind one search offers, the most seeded first. */
const OFFERS = 10;

/** How long a search may take. Prowlarr asks every tracker in turn. */
const SEARCH_TIME = "1 minute";

/** The part of a release in Prowlarr's search results that Prosody reads. */
export const Found = Schema.Struct({
	guid: Schema.String,
	indexerId: Schema.Int,
	indexer: Schema.String,
	title: Schema.String,
	size: Schema.Finite,
	seeders: Schema.optionalKey(Schema.NullOr(Schema.Int)),
	publishDate: Schema.String,
	infoUrl: Schema.optionalKey(Schema.NullOr(Schema.String)),
	categories: Schema.Array(Schema.Struct({ id: Schema.Int })),
});

export type Found = typeof Found.Type;

/**
 * Which edition a release is, by the categories Prowlarr gives it: the audio ones are in the
 * 3000s, the book ones in the 7000s. Anything else is no edition at all.
 */
const kindOf = (found: Found): Release["kind"] | undefined => {
	const ids = found.categories.map(({ id }) => id);

	if (ids.some((id) => id >= 3000 && id < 4000)) {
		return "audio";
	}

	return ids.some((id) => id >= 7000 && id < 8000) ? "text" : undefined;
};

const failed = (reason: string) => new IndexerFailed({ reason });

/**
 * Prowlarr's results as releases of a book, the most seeded first, ten of each kind at most so
 * neither crowds out the other. A release's id is the name Prowlarr grabs it by, its
 * indexer's number and its guid.
 */
export const releasesOf = (results: ReadonlyArray<Found>): Array<Release> => {
	const releases = results
		.flatMap((found) => {
			const kind = kindOf(found);

			return kind === undefined
				? []
				: [
						{
							id: `${found.indexerId}_${found.guid}`,
							indexer: found.indexer,
							title: found.title,
							kind,
							bytes: found.size,
							seeders: found.seeders ?? 0,
							published: found.publishDate,
							page: found.infoUrl ?? null,
						},
					];
		})
		.toSorted((a, b) => b.seeders - a.seeders);

	const most = (kind: Release["kind"]) =>
		releases.filter((release) => release.kind === kind).slice(0, OFFERS);

	return [...most("audio"), ...most("text")].toSorted(
		(a, b) => b.seeders - a.seeders
	);
};

/**
 * Where Prowlarr answers, with no slash at the end, and its API key: `INDEXER_URL` and
 * `INDEXER_API_KEY`, read from `.env` or the shell where the stack is deployed. Whatever reads them
 * while a deploy is planned is given them in its environment: the runner pool does, in
 * `ProsodyLive.ts`, and the Indexer reads them only as it searches.
 */
export const ProwlarrSettings = Config.all({
	url: Config.String("INDEXER_URL"),
	key: Config.Redacted("INDEXER_API_KEY"),
});

/**
 * The Indexer, played by Prowlarr, which holds the tracker accounts. Prosody holds
 * only Prowlarr's address and its API key. Prowlarr down, or refusing the key, is a failed search,
 * with the reason.
 */
export const ProwlarrIndexer = Indexer.toLayer(
	Effect.gen(function* () {
		const client = yield* HttpClient.HttpClient;

		return {
			search: Effect.fn("Prowlarr.search")(function* ({ title, author }) {
				const { url, key } = yield* Effect.orDie(ProwlarrSettings);

				const response = yield* client
					.get(`${url}/api/v1/search`, {
						urlParams: {
							query: `${title} ${author}`,
							type: "search",
							categories: [AUDIOBOOKS, EBOOKS],
							limit: 100,
						},
						headers: { "X-Api-Key": Redacted.value(key) },
					})
					.pipe(
						Effect.timeout(SEARCH_TIME),
						Effect.mapError(() => failed("Prowlarr did not answer"))
					);

				if (response.status === 401) {
					return yield* failed("Prowlarr refused its API key");
				}

				if (response.status !== 200) {
					return yield* failed(`Prowlarr answered ${response.status}`);
				}

				const results = yield* HttpClientResponse.schemaBodyJson(
					Schema.Array(Found)
				)(response).pipe(
					Effect.mapError(() => failed("Prowlarr's answer could not be read"))
				);

				return { releases: releasesOf(results) };
			}),
		};
	})
).pipe(Layer.provide(FetchHttpClient.layer));

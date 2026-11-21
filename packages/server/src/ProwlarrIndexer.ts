import {
	Indexer,
	IndexerFailed,
} from "@prosody/domain/Acquisition/Indexer.external";
import type { Release } from "@prosody/domain/Acquisition/Release";
import { Config, Effect, Layer, Redacted, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";

const AUDIOBOOKS = 3030;

const EBOOKS = 7020;

const OFFERS = 10;

const SEARCH_TIME = "1 minute";

export const Found = Schema.Struct({
	guid: Schema.String,
	indexerId: Schema.Int,
	indexer: Schema.String,
	title: Schema.String,
	size: Schema.Finite,
	seeders: Schema.optionalKey(Schema.NullOr(Schema.Int)),
	publishDate: Schema.String,
	infoUrl: Schema.optionalKey(Schema.NullOr(Schema.String)),
	downloadUrl: Schema.optionalKey(Schema.NullOr(Schema.String)),
	categories: Schema.Array(Schema.Struct({ id: Schema.Int })),
});

export type Found = typeof Found.Type;

const kindOf = (found: Found): Release["kind"] | undefined => {
	const ids = found.categories.map(({ id }) => id);

	if (ids.some((id) => id >= 3000 && id < 4000)) {
		return "audio";
	}

	return ids.some((id) => id >= 7000 && id < 8000) ? "text" : undefined;
};

const failed = (reason: string) => new IndexerFailed({ reason });

const linkOf = (found: Found): string | undefined => {
	if (found.downloadUrl === undefined || found.downloadUrl === null) {
		return undefined;
	}

	const link = new URL(found.downloadUrl);

	link.searchParams.delete("apikey");

	return `${link.pathname}${link.search}`;
};

export const releasesOf = (results: ReadonlyArray<Found>): Array<Release> => {
	const releases = results
		.flatMap((found) => {
			const kind = kindOf(found);
			const link = linkOf(found);

			return kind === undefined || link === undefined
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
							link,
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

export const NOT_SET_UP = "Fetching is not set up on this host";

export const ProwlarrSettings = Config.all({
	url: Config.String("INDEXER_URL").pipe(Config.withDefault("")),
	key: Config.Redacted("INDEXER_API_KEY").pipe(
		Config.withDefault(Redacted.make(""))
	),
});

const settings = Effect.gen(function* () {
	const set = yield* Effect.orDie(ProwlarrSettings);

	return set.url === "" ? yield* failed(NOT_SET_UP) : set;
});

export const torrentOf = Effect.fn("Prowlarr.torrent")(function* (
	link: string
) {
	const { url, key } = yield* settings;
	const client = yield* HttpClient.HttpClient;

	const response = yield* client
		.get(`${url}${link}`, { headers: { "X-Api-Key": Redacted.value(key) } })
		.pipe(
			Effect.timeout(SEARCH_TIME),
			Effect.mapError(() => failed("Prowlarr did not answer"))
		);

	if (response.status !== 200) {
		return yield* failed(
			`Prowlarr could not fetch its torrent: it answered ${response.status}`
		);
	}

	const bytes = yield* response.arrayBuffer.pipe(
		Effect.mapError(() => failed("Prowlarr's torrent could not be read"))
	);

	return new Uint8Array(bytes);
});

export const ProwlarrIndexer = Indexer.toLayer(
	Effect.gen(function* () {
		const client = yield* HttpClient.HttpClient;

		return {
			search: Effect.fn("Prowlarr.search")(function* ({ title, author }) {
				const { url, key } = yield* settings;

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

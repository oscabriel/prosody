import { Metadata } from "@prosody/domain/Library/Metadata.external";
import type { Recording } from "@prosody/domain/Library/Metadata.external";
import { Effect, Layer, Option, Schema } from "effect";
import {
	FetchHttpClient,
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "effect/http";

const AGENT = "Prosody (a self-hosted book catalogue)";

const OPEN_LIBRARY = "https://openlibrary.org/search.json";

const AUDIBLE = "https://api.audible.com/1.0/catalog/products";

const AUDNEXUS = "https://api.audnex.us/books";

const OPEN_LIBRARY_TIME = "8 seconds";

const RECORDING_TIME = "30 seconds";

const Works = Schema.Struct({
	docs: Schema.Array(
		Schema.Struct({
			key: Schema.String,
			title: Schema.String,
			author_name: Schema.optionalKey(Schema.Array(Schema.String)),
			first_publish_year: Schema.optionalKey(Schema.Int),
		})
	),
});

const Products = Schema.Struct({
	products: Schema.Array(
		Schema.Struct({
			asin: Schema.String,
			title: Schema.optionalKey(Schema.String),
		})
	),
});

export const Audiobook = Schema.Struct({
	asin: Schema.String,
	narrators: Schema.optionalKey(
		Schema.Array(Schema.Struct({ name: Schema.String }))
	),
	runtimeLengthMin: Schema.optionalKey(Schema.Int),
});

export type Audiobook = typeof Audiobook.Type;

export const Chapters = Schema.Struct({
	chapters: Schema.Array(
		Schema.Struct({
			title: Schema.String,
			startOffsetMs: Schema.Int,
			lengthMs: Schema.Int,
		})
	),
});

export type Chapters = typeof Chapters.Type;

export const comparable = (title: string): string =>
	title
		.normalize("NFKD")
		.toLowerCase()
		.replaceAll(/[^\p{L}\p{N}]+/gu, " ")
		.trim();

export const completes = (asked: string, found: string): boolean => {
	const words = new Set(comparable(found).split(" "));

	return comparable(asked)
		.split(" ")
		.every((word) => words.has(word));
};

export const recordingOf = (
	audiobook: Audiobook,
	{ chapters }: Chapters
): Recording => ({
	asin: audiobook.asin,
	narrators: (audiobook.narrators ?? []).map(({ name }) => name),
	minutes: audiobook.runtimeLengthMin ?? 0,
	chapters: chapters.map(({ title, startOffsetMs, lengthMs }) => ({
		title,
		start: startOffsetMs / 1000,
		end: (startOffsetMs + lengthMs) / 1000,
	})),
});

export const OpenLibraryMetadata = Metadata.toLayer(
	Effect.gen(function* () {
		const client = HttpClient.filterStatusOk(
			(yield* HttpClient.HttpClient).pipe(
				HttpClient.mapRequest(HttpClientRequest.setHeader("User-Agent", AGENT))
			)
		);

		const json = <S extends Schema.Top>(schema: S, url: string, params = {}) =>
			client
				.get(url, { urlParams: params })
				.pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)));

		const recording = Effect.fn("Metadata.recording")(function* (
			title: string,
			author: string
		) {
			const { products } = yield* json(Products, AUDIBLE, {
				title,
				author,
				num_results: 20,
				products_sort_by: "Relevance",
				response_groups: "product_desc",
			});

			const product = products.find(
				(found) => comparable(found.title ?? "") === comparable(title)
			);

			if (product === undefined) {
				return null;
			}

			const audiobook = yield* json(Audiobook, `${AUDNEXUS}/${product.asin}`);

			const chapters = yield* json(
				Chapters,
				`${AUDNEXUS}/${product.asin}/chapters`
			).pipe(Effect.orElseSucceed(() => ({ chapters: [] })));

			return recordingOf(audiobook, chapters);
		});

		return {
			describe: Effect.fn("Metadata.describe")(function* ({ title, author }) {
				const { docs } = yield* json(Works, OPEN_LIBRARY, {
					title,
					author,
					limit: 1,
					fields: "key,title,author_name,first_publish_year",
				}).pipe(Effect.timeout(OPEN_LIBRARY_TIME), Effect.orDie);

				const work = Option.filter(Option.fromUndefinedOr(docs[0]), (found) =>
					completes(title, found.title)
				);

				const named = Option.match(work, {
					onNone: () => ({ title, author }),
					onSome: (found) => ({
						title: found.title,
						author:
							found.author_name?.find((name) => completes(author, name)) ??
							author,
					}),
				});

				return {
					...named,
					description: {
						year: Option.getOrNull(
							Option.flatMapNullishOr(work, (found) => found.first_publish_year)
						),
						openLibrary: Option.getOrNull(
							Option.map(work, (found) => found.key.replace("/works/", ""))
						),
						recording: yield* recording(named.title, named.author).pipe(
							Effect.timeout(RECORDING_TIME),
							Effect.orElseSucceed(() => null)
						),
					},
				};
			}),
		};
	})
).pipe(Layer.provide(FetchHttpClient.layer));

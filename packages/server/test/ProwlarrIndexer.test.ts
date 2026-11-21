import { describe, expect, it } from "@effect/vitest";
import { Indexer } from "@prosody/domain/Acquisition/Indexer.external";
import { ConfigProvider, Effect, Layer, ManagedRuntime } from "effect";

import type { Found } from "../src/ProwlarrIndexer.ts";
import {
	NOT_SET_UP,
	ProwlarrIndexer,
	releasesOf,
} from "../src/ProwlarrIndexer.ts";

const found = (
	title: string,
	categories: ReadonlyArray<number>,
	seeders: number | null
): Found => ({
	guid: `https://tracker.example/t/${title}`,
	indexerId: 4,
	indexer: "Bookish",
	title,
	size: 1000,
	seeders,
	publishDate: "2021-05-04T00:00:00Z",
	infoUrl: `https://tracker.example/t/${title}`,
	downloadUrl: `http://prowlarr:9696/4/download?apikey=secret&link=${title}&file=${title}`,
	categories: categories.map((id) => ({ id })),
});

describe("Prowlarr's results", () => {
	it("are releases of an edition, known by their categories, the most seeded first", () => {
		const releases = releasesOf([
			found("ebook", [7020, 100_014], 3),
			found("audiobook", [3030, 100_013], 41),
			found("film", [2000], 99),
		]);

		expect(
			releases.map(({ title, kind, seeders }) => [title, kind, seeders])
		).toStrictEqual([
			["audiobook", "audio", 41],
			["ebook", "text", 3],
		]);
	});

	it("are named as Prowlarr grabs them, by indexer and guid", () => {
		const [release] = releasesOf([found("ebook", [7020], 3)]);

		expect(release?.id).toBe("4_https://tracker.example/t/ebook");
	});

	it("are fetched by a link that holds no API key, or not offered", () => {
		const [release] = releasesOf([
			found("ebook", [7020], 3),
			{ ...found("unfetchable", [7020], 9), downloadUrl: null },
		]);

		expect(release?.link).toBe("/4/download?link=ebook&file=ebook");
	});

	it("count no seeders as none, and offer ten of each kind at most", () => {
		const audiobooks = Array.from({ length: 25 }, (_, n) =>
			found(`audiobook ${n}`, [3030], 100 + n)
		);

		const ebooks = Array.from({ length: 12 }, (_, n) =>
			found(`ebook ${n}`, [7020], n === 0 ? null : n)
		);

		const releases = releasesOf([...audiobooks, ...ebooks]);

		expect(releases.filter(({ kind }) => kind === "audio")).toHaveLength(10);
		expect(releases.filter(({ kind }) => kind === "text")).toHaveLength(10);
		expect(releases.at(0)?.seeders).toBe(124);
		expect(releases.at(-1)?.seeders).toBe(2);
	});
});

const Unset = ProwlarrIndexer.pipe(
	Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord({})))
);

const refusal = Effect.gen(function* () {
	const indexer = yield* Indexer;

	return yield* Effect.flip(
		indexer.search({ title: "Emma", author: "Jane Austen" })
	);
});

describe("A host with no settings for fetching", () => {
	it("refuses a search, and says why", async () => {
		const refused = await ManagedRuntime.make(Unset).runPromise(refusal);

		expect(refused.reason).toBe(NOT_SET_UP);
	});
});

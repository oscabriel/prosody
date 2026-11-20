import { describe, expect, it } from "@effect/vitest";

import type { Found } from "../src/ProwlarrIndexer.ts";
import { releasesOf } from "../src/ProwlarrIndexer.ts";

/** A result as Prowlarr gives it, in these categories, with this many seeders. */
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

import { Story } from "@alchemy.run/domain/Story";
import { assert, describe, it } from "@effect/vitest";

import { Downloads } from "../src/Acquisition/Downloads.external.ts";
import { Indexer, IndexerFailed } from "../src/Acquisition/Indexer.external.ts";
import {
	OfferReleases,
	ReleasesOffered,
} from "../src/Acquisition/OfferReleases.command.ts";
import {
	RecordSearchFailed,
	SearchFailed,
} from "../src/Acquisition/RecordSearchFailed.command.ts";
import type { Release } from "../src/Acquisition/Release.ts";
import { SearchAgain } from "../src/Acquisition/SearchAgain.command.ts";
import { Want } from "../src/Acquisition/Want.aggregate.ts";
import {
	BookWanted,
	SearchStarted,
	WantBook,
} from "../src/Acquisition/WantBook.command.ts";
import { Wanted } from "../src/Acquisition/Wanted.view.ts";
import {
	NotWanted,
	WantWithdrawn,
	WithdrawWant,
} from "../src/Acquisition/WithdrawWant.command.ts";
import { Device } from "../src/Device.context.ts";
import { WorkCatalogued } from "../src/Library/CatalogueWork.command.ts";
import { Metadata } from "../src/Library/Metadata.external.ts";
import { SHELF, Shelf } from "../src/Library/Shelf.view.ts";
import { Stacks } from "../src/Library/Stacks.external.ts";
import { Work } from "../src/Library/Work.aggregate.ts";
import { Aligner } from "../src/Narration/Aligner.external.ts";
import { Prosody, ProsodyHandlers } from "../src/Prosody.model.ts";
import { Copier } from "../src/Reading/Copier.external.ts";

const { call, fail, given, provide, rejected, succeed, then, view, when } =
	Story;

const story = Story.make(Prosody, {
	layer: ProsodyHandlers,
	stub: [Indexer, Downloads, Metadata, Stacks, Aligner, Copier],
});

const hailMary = Want.ref("w-hailmary");

const book = { title: "Project Hail Mary", author: "Andy Weir" };

const wanted = new BookWanted(book);

/** Project Hail Mary as Open Library and Audnexus know it. */
const description = {
	year: 2021,
	openLibrary: "OL21745884W",
	recording: {
		asin: "B08G9PRS1K",
		narrators: ["Ray Porter"],
		minutes: 970,
		chapters: [{ title: "Chapter 1", start: 17, end: 2221 }],
	},
};

/** The catalogues outside are asked about a wanted book, and its work is catalogued as they answer. */
const described = [
	call(Metadata.describe, book),
	succeed(Metadata.describe, { ...book, description }),
	then(
		Work.ref("w-hailmary"),
		new WorkCatalogued({ ...book, shelfmark: null, description })
	),
] as const;

const audiobook: Release = {
	id: "https://tracker.example/t/1",
	indexer: "Bookish",
	title: "Project Hail Mary - Andy Weir [M4B]",
	kind: "audio",
	bytes: 924_597_510,
	seeders: 41,
	published: "2021-05-04T00:00:00Z",
	page: "https://tracker.example/t/1",
	link: "/1/download?link=b25l&file=Project+Hail+Mary",
};

/** When a story commits its events: its clock stands at the start of 2026. */
const NEW_YEAR = Date.UTC(2026, 0, 1);

/** You want books from one of your devices, as everything a reader sends. */
const fromLaptop = provide(Device, "laptop");

describe("a book you want", () => {
	it.effect("is searched for, and what the Indexer finds is offered", () =>
		story(
			fromLaptop,
			when(hailMary, new WantBook(book)),
			then(hailMary, wanted, new SearchStarted({ search: 1 })),
			...described,
			call(Indexer.search, book),
			succeed(Indexer.search, { releases: [audiobook] }),
			then(hailMary, new ReleasesOffered({ releases: [audiobook] })),
			view(Wanted, SHELF, {
				wants: {
					"w-hailmary": {
						...book,
						at: NEW_YEAR,
						state: "offered",
						note: "",
						offers: [audiobook],
						grabbed: [],
					},
				},
				catalogue: { "w-hailmary": { ...book, description } },
			})
		)
	);

	it.effect("records why a search failed", () =>
		story(
			fromLaptop,
			when(hailMary, new WantBook(book)),
			then(hailMary, wanted, new SearchStarted({ search: 1 })),
			...described,
			call(Indexer.search, book),
			fail(
				Indexer.search,
				new IndexerFailed({ reason: "Prowlarr refused the API key" })
			),
			then(
				hailMary,
				new SearchFailed({ reason: "Prowlarr refused the API key" })
			),
			view(Wanted, SHELF, {
				wants: {
					"w-hailmary": {
						...book,
						at: NEW_YEAR,
						state: "failed",
						note: "Prowlarr refused the API key",
						offers: [],
						grabbed: [],
					},
				},
			})
		)
	);

	it.effect(
		"is catalogued as the catalogues outside know it, and not shelved",
		() =>
			story(
				fromLaptop,
				when(
					hailMary,
					new WantBook({ title: "project hail mary", author: "weir" })
				),
				then(
					hailMary,
					new BookWanted({ title: "project hail mary", author: "weir" }),
					new SearchStarted({ search: 1 })
				),
				call(Metadata.describe, { title: "project hail mary", author: "weir" }),
				succeed(Metadata.describe, { ...book, description }),
				then(
					Work.ref("w-hailmary"),
					new WorkCatalogued({ ...book, shelfmark: null, description })
				),
				call(Indexer.search, { title: "project hail mary", author: "weir" }),
				succeed(Indexer.search, { releases: [] }),
				then(hailMary, new ReleasesOffered({ releases: [] })),
				view(Shelf, SHELF, { works: {} })
			)
	);

	it.effect("records nothing when it is wanted again", () =>
		story(
			fromLaptop,
			given(hailMary, wanted, new SearchStarted({ search: 1 })),
			when(hailMary, new WantBook(book)),
			then(hailMary)
		)
	);

	it.effect("is searched for again when you ask", () =>
		story(
			fromLaptop,
			given(
				hailMary,
				wanted,
				new SearchStarted({ search: 1 }),
				new SearchFailed({ reason: "Prowlarr did not answer" })
			),
			when(hailMary, new SearchAgain()),
			then(hailMary, new SearchStarted({ search: 2 })),
			call(Indexer.search, book),
			succeed(Indexer.search, { releases: [] }),
			then(hailMary, new ReleasesOffered({ releases: [] }))
		)
	);

	it.effect("takes no answer to an earlier search", () =>
		story(
			given(
				hailMary,
				wanted,
				new SearchStarted({ search: 1 }),
				new SearchStarted({ search: 2 })
			),
			when(hailMary, new OfferReleases({ search: 1, releases: [audiobook] })),
			then(hailMary)
		)
	);

	it.effect("takes no answer once it is withdrawn", () =>
		story(
			given(
				hailMary,
				wanted,
				new SearchStarted({ search: 1 }),
				new WantWithdrawn()
			),
			when(
				hailMary,
				new RecordSearchFailed({ search: 1, reason: "Prowlarr did not answer" })
			),
			then(hailMary)
		)
	);

	it.effect("is withdrawn", () =>
		story(
			fromLaptop,
			given(hailMary, wanted, new SearchStarted({ search: 1 })),
			when(hailMary, new WithdrawWant()),
			then(hailMary, new WantWithdrawn()),
			view(Wanted, SHELF, ({ wants }) => {
				assert.deepStrictEqual(wants, {});
			})
		)
	);

	it.effect("is not withdrawn, or searched for, when it is not wanted", () =>
		story(
			fromLaptop,
			when(hailMary, new WithdrawWant()),
			rejected(new NotWanted()),
			when(hailMary, new SearchAgain()),
			rejected(new NotWanted())
		)
	);
});

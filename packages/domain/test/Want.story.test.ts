import { Story } from "@alchemy.run/domain/Story";
import { describe, it } from "@effect/vitest";

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
import {
	NotWanted,
	WantWithdrawn,
	WithdrawWant,
} from "../src/Acquisition/WithdrawWant.command.ts";
import { Device } from "../src/Device.context.ts";
import { Aligner } from "../src/Narration/Aligner.external.ts";
import { Prosody, ProsodyHandlers } from "../src/Prosody.model.ts";
import { Copier } from "../src/Reading/Copier.external.ts";

const { call, fail, given, provide, rejected, succeed, then, when } = Story;

const story = Story.make(Prosody, {
	layer: ProsodyHandlers,
	stub: [Indexer, Aligner, Copier],
});

const hailMary = Want.ref("w-hailmary");

const book = { title: "Project Hail Mary", author: "Andy Weir" };

const wanted = new BookWanted(book);

const audiobook: Release = {
	id: "https://tracker.example/t/1",
	indexer: "Bookish",
	title: "Project Hail Mary - Andy Weir [M4B]",
	kind: "audio",
	bytes: 924_597_510,
	seeders: 41,
	published: "2021-05-04T00:00:00Z",
	page: "https://tracker.example/t/1",
};

/** You want books from one of your devices, as everything a reader sends. */
const fromLaptop = provide(Device, "laptop");

describe("a book you want", () => {
	it.effect("is searched for, and what the Indexer finds is offered", () =>
		story(
			fromLaptop,
			when(hailMary, new WantBook(book)),
			then(hailMary, wanted, new SearchStarted({ search: 1 })),
			call(Indexer.search, book),
			succeed(Indexer.search, { releases: [audiobook] }),
			then(hailMary, new ReleasesOffered({ releases: [audiobook] }))
		)
	);

	it.effect("records why a search failed", () =>
		story(
			fromLaptop,
			when(hailMary, new WantBook(book)),
			then(hailMary, wanted, new SearchStarted({ search: 1 })),
			call(Indexer.search, book),
			fail(
				Indexer.search,
				new IndexerFailed({ reason: "Prowlarr refused the API key" })
			),
			then(
				hailMary,
				new SearchFailed({ reason: "Prowlarr refused the API key" })
			)
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
			then(hailMary, new WantWithdrawn())
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

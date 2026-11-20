import * as Domain from "@alchemy.run/domain";
import { Story } from "@alchemy.run/domain/Story";
import { describe, expect, it } from "@effect/vitest";

import { Indexer } from "../src/Acquisition/Indexer.external.ts";
import {
	CatalogueWork,
	WorkCatalogued,
} from "../src/Library/CatalogueWork.command.ts";
import { SHELF, Shelf } from "../src/Library/Shelf.view.ts";
import { Shelfmark } from "../src/Library/Shelfmark.ts";
import {
	AlreadyShelved,
	EditionShelved,
	NotCatalogued,
	ShelveEdition,
} from "../src/Library/ShelveEdition.command.ts";
import { Work } from "../src/Library/Work.aggregate.ts";
import { Aligner } from "../src/Narration/Aligner.external.ts";
import { Prosody, ProsodyHandlers } from "../src/Prosody.model.ts";
import { Copier } from "../src/Reading/Copier.external.ts";

const { given, rejected, then, view, when } = Story;

const story = Story.make(Prosody, {
	layer: ProsodyHandlers,
	stub: [Indexer, Aligner, Copier],
});

const carl = Work.ref("w-carl");

const shelfmark = Shelfmark.make("Matt Dinniman/Dungeon Crawler Carl");

const catalogued = new WorkCatalogued({
	title: "Dungeon Crawler Carl",
	author: "Matt Dinniman",
	shelfmark,
});

const epub = {
	kind: "text" as const,
	file: "Dungeon Crawler Carl - Matt Dinniman.epub",
	bytes: 900_000,
};

/** The shelf holding only Carl, with these editions. */
const shelfWith = (editions: { text: boolean; audio: boolean }) => ({
	works: {
		"w-carl": {
			title: "Dungeon Crawler Carl",
			author: "Matt Dinniman",
			shelfmark,
			...editions,
		},
	},
});

describe("the library", () => {
	it("the model is consistent", () => {
		expect(Domain.verify(Prosody)).toStrictEqual([]);
	});

	it.effect("a catalogued work appears on the shelf with no editions", () =>
		story(
			when(
				carl,
				new CatalogueWork({
					title: "Dungeon Crawler Carl",
					author: "Matt Dinniman",
					shelfmark,
				})
			),
			then(carl, catalogued),
			view(Shelf, SHELF, shelfWith({ text: false, audio: false }))
		)
	);

	it.effect("cataloguing a work again records nothing", () =>
		story(
			given(carl, catalogued),
			when(
				carl,
				new CatalogueWork({
					title: "Another Title",
					author: "Matt Dinniman",
					shelfmark,
				})
			),
			then(carl)
		)
	);

	it.effect("a shelved edition shows on the shelf", () =>
		story(
			given(carl, catalogued),
			when(carl, new ShelveEdition(epub)),
			then(carl, new EditionShelved(epub)),
			view(Shelf, SHELF, shelfWith({ text: true, audio: false }))
		)
	);

	it.effect("an edition can't be shelved before its work is catalogued", () =>
		story(when(carl, new ShelveEdition(epub)), rejected(new NotCatalogued()))
	);

	it.effect("shelving the same file again records nothing", () =>
		story(
			given(carl, catalogued, new EditionShelved(epub)),
			when(carl, new ShelveEdition(epub)),
			then(carl)
		)
	);

	it.effect(
		"a second file for the same edition is refused, naming the first",
		() =>
			story(
				given(carl, catalogued, new EditionShelved(epub)),
				when(
					carl,
					new ShelveEdition({ kind: "text", file: "another.epub", bytes: 1 })
				),
				rejected(new AlreadyShelved({ kind: "text", file: epub.file }))
			)
	);
});

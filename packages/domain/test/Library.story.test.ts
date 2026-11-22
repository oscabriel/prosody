import * as Domain from "@alchemy.run/domain";
import { Story } from "@alchemy.run/domain/Story";
import { assert, describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import { Downloads } from "../src/Acquisition/Downloads.external.ts";
import { Indexer } from "../src/Acquisition/Indexer.external.ts";
import { Wanted } from "../src/Acquisition/Wanted.view.ts";
import { Actor } from "../src/Actor.context.ts";
import {
	CatalogueWork,
	WorkCatalogued,
} from "../src/Library/CatalogueWork.command.ts";
import {
	ClaimShelfmark,
	ShelfmarkClaimed,
	ShelfmarkTaken,
} from "../src/Library/ClaimShelfmark.command.ts";
import {
	CorrectTitle,
	OnTheShelf,
	TitleCorrected,
} from "../src/Library/CorrectTitle.command.ts";
import { Metadata } from "../src/Library/Metadata.external.ts";
import { SHELF, Shelf } from "../src/Library/Shelf.view.ts";
import { Shelfmark, shelfmarkOf } from "../src/Library/Shelfmark.ts";
import { ShelfmarkClaim } from "../src/Library/ShelfmarkClaim.aggregate.ts";
import {
	AlreadyShelved,
	EditionShelved,
	NotCatalogued,
	ShelveEdition,
} from "../src/Library/ShelveEdition.command.ts";
import { Stacks } from "../src/Library/Stacks.external.ts";
import { Work } from "../src/Library/Work.aggregate.ts";
import { WorkId } from "../src/Library/Work.id.ts";
import { Aligner } from "../src/Narration/Aligner.external.ts";
import { Prosody, ProsodyHandlers } from "../src/Prosody.model.ts";
import { ReaderId } from "../src/Reader.id.ts";
import { Copier } from "../src/Reading/Copier.external.ts";

const { given, provide, rejected, then, view, when } = Story;

const story = Story.make(Prosody, {
	layer: ProsodyHandlers,
	stub: [Indexer, Downloads, Metadata, Stacks, Aligner, Copier],
});

const carl = Work.ref("w-carl");

const shelfmark = Shelfmark.make("Matt Dinniman/Dungeon Crawler Carl");

const catalogued = new WorkCatalogued({
	title: "Dungeon Crawler Carl",
	author: "Matt Dinniman",
	shelfmark,
	description: null,
});

const epub = {
	kind: "text" as const,
	file: "Dungeon Crawler Carl - Matt Dinniman.epub",
	bytes: 900_000,
};

const shelfWith = (
	editions: Partial<Record<"text" | "audio" | "pages", boolean>>
) => ({
	works: {
		"w-carl": {
			title: "Dungeon Crawler Carl",
			author: "Matt Dinniman",
			shelfmark,
			text: false,
			audio: false,
			pages: false,
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
					description: null,
				})
			),
			then(carl, catalogued),
			view(Shelf, SHELF, shelfWith({}))
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
					description: null,
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
			view(Shelf, SHELF, shelfWith({ text: true }))
		)
	);

	it.effect("a PDF beside the text is shelved as the work's pages", () =>
		story(
			given(carl, catalogued, new EditionShelved(epub)),
			when(
				carl,
				new ShelveEdition({
					kind: "pages",
					file: "Dungeon Crawler Carl - Matt Dinniman.pdf",
					bytes: 4_000_000,
				})
			),
			then(
				carl,
				new EditionShelved({
					kind: "pages",
					file: "Dungeon Crawler Carl - Matt Dinniman.pdf",
					bytes: 4_000_000,
				})
			),
			view(Shelf, SHELF, shelfWith({ text: true, pages: true }))
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

describe("a work you wanted", () => {
	const wanted = new WorkCatalogued({
		title: "Dungeon Crawler Carl",
		author: "Matt Dinniman",
		shelfmark: null,
		description: { year: 2020, openLibrary: "OL1W", recording: null },
	});

	it.effect(
		"is catalogued again, at its shelfmark, when it is found on the shelf",
		() =>
			story(
				given(carl, wanted),
				when(
					carl,
					new CatalogueWork({
						title: "Dungeon Crawler Carl",
						author: "Matt Dinniman",
						shelfmark,
						description: null,
					})
				),
				then(carl, catalogued),
				view(Shelf, SHELF, shelfWith({}))
			)
	);

	it.effect("has its title corrected until it is on the shelf", () =>
		story(
			provide(Actor, {
				reader: ReaderId.make("u-keeper"),
				role: "admin",
				device: "laptop",
			}),
			given(carl, wanted),
			when(
				carl,
				new CorrectTitle({
					title: "Dungeon Crawler Carl",
					author: "Matt Dinniman",
				})
			),
			then(
				carl,
				new TitleCorrected({
					title: "Dungeon Crawler Carl",
					author: "Matt Dinniman",
				})
			),
			view(Wanted, SHELF, ({ catalogue }) => {
				assert.strictEqual(catalogue["w-carl"]?.author, "Matt Dinniman");
			}),
			given(carl, catalogued),
			when(carl, new CorrectTitle({ title: "Carl", author: "Matt Dinniman" })),
			rejected(new OnTheShelf())
		)
	);

	it.effect("has no title to correct before it is catalogued", () =>
		story(
			provide(Actor, {
				reader: ReaderId.make("u-keeper"),
				role: "admin",
				device: "laptop",
			}),
			when(carl, new CorrectTitle({ title: "Carl", author: "Matt Dinniman" })),
			rejected(new NotCatalogued())
		)
	);
});

describe("a folder in the library", () => {
	const folder = ShelfmarkClaim.ref(shelfmark);

	const carlId = WorkId.make("w-carl");

	it.effect(
		"is held by the first work to claim it, and named to the rest",
		() =>
			story(
				when(folder, new ClaimShelfmark({ work: carlId })),
				then(folder, new ShelfmarkClaimed({ work: carlId })),
				when(folder, new ClaimShelfmark({ work: carlId })),
				then(folder),
				when(folder, new ClaimShelfmark({ work: WorkId.make("w-second") })),
				rejected(new ShelfmarkTaken({ work: carlId }))
			)
	);

	it("is named for its work's author and title, as one folder", () => {
		expect(
			shelfmarkOf("Martin Kleppmann", "Designing Data: The Big Ideas")
		).toBe("Martin Kleppmann/Designing Data - The Big Ideas");
		expect(shelfmarkOf(" AC/DC ", 'What? "No"')).toBe("ACDC/What No");
	});
});

describe("a work catalogued before descriptions", () => {
	it("has none", () => {
		const stored: unknown = JSON.parse(
			'{"_tag":"WorkCatalogued","title":"Dungeon Crawler Carl","author":"Matt Dinniman","shelfmark":"Matt Dinniman/Dungeon Crawler Carl"}'
		);

		expect(
			Schema.decodeUnknownSync(WorkCatalogued)(stored).description
		).toBeNull();
	});
});

import { Story } from "@alchemy.run/domain/Story";
import { describe, it } from "@effect/vitest";

import { Downloads } from "../src/Acquisition/Downloads.external.ts";
import { Indexer } from "../src/Acquisition/Indexer.external.ts";
import { Device } from "../src/Device.context.ts";
import { WorkCatalogued } from "../src/Library/CatalogueWork.command.ts";
import { Metadata } from "../src/Library/Metadata.external.ts";
import { SHELF, Shelf } from "../src/Library/Shelf.view.ts";
import { Shelfmark } from "../src/Library/Shelfmark.ts";
import { EditionShelved } from "../src/Library/ShelveEdition.command.ts";
import { Stacks } from "../src/Library/Stacks.external.ts";
import { Work } from "../src/Library/Work.aggregate.ts";
import { WorkId } from "../src/Library/Work.id.ts";
import { Aligner } from "../src/Narration/Aligner.external.ts";
import { Prosody, ProsodyHandlers } from "../src/Prosody.model.ts";
import { Copier } from "../src/Reading/Copier.external.ts";
import { Copy } from "../src/Reading/Copy.aggregate.ts";
import {
	CopyEdition,
	CopyStarted,
} from "../src/Reading/CopyEdition.command.ts";
import { CopyMade, RecordCopy } from "../src/Reading/RecordCopy.command.ts";
import {
	CopyFailed,
	RecordCopyFailed,
} from "../src/Reading/RecordCopyFailed.command.ts";
import {
	NothingToCopy,
	RemakeCopy,
} from "../src/Reading/RemakeCopy.command.ts";

const { call, given, provide, rejected, succeed, then, view, when } = Story;

const story = Story.make(Prosody, {
	layer: ProsodyHandlers,
	stub: [Indexer, Downloads, Metadata, Stacks, Aligner, Copier],
});

const odyssey = Copy.ref("w-odyssey");

const shelfmark = Shelfmark.make("Homer/The Odyssey");

const epub = {
	shelfmark,
	kind: "text" as const,
	file: "The Odyssey - Homer.epub",
	bytes: 1000,
};

const pdf = {
	shelfmark,
	kind: "pages" as const,
	file: "The Odyssey - Homer.pdf",
	bytes: 4000,
};

/** The Odyssey's file of each kind. */
const FILES = {
	text: epub.file,
	audio: "The Odyssey.m4b",
	pages: pdf.file,
};

/** The Odyssey in the library, with these files. */
const shelved = (...kinds: ReadonlyArray<keyof typeof FILES>) =>
	given(
		Work.ref("w-odyssey"),
		new WorkCatalogued({
			title: "The Odyssey",
			author: "Homer",
			shelfmark,
			description: null,
		}),
		...kinds.map(
			(kind) =>
				new EditionShelved({
					kind,
					file: FILES[kind],
					bytes: 1000,
				})
		)
	);

/** What the press is asked for the given try, of the text or of another edition. */
const asked = (attempt: number, edition: typeof epub | typeof pdf = epub) => ({
	work: WorkId.make("w-odyssey"),
	attempt,
	shelfmark,
	kind: edition.kind,
	file: edition.file,
});

/** A remake comes from one of your devices, as everything a reader sends does. */
const fromLaptop = provide(Device, "laptop");

describe("the copy of a work with one edition", () => {
	it.effect("starts its first try, and the press is asked", () =>
		story(
			shelved("text"),
			when(odyssey, new CopyEdition(epub)),
			then(odyssey, new CopyStarted({ ...epub, attempt: 1 })),
			call(Copier.copy, asked(1)),
			succeed(Copier.copy, undefined),
			view(Shelf, SHELF, {
				copies: { "w-odyssey": { state: "copying", note: "copying" } },
			})
		)
	);

	it.effect("records nothing when the same edition is sent again", () =>
		story(
			given(odyssey, new CopyStarted({ ...epub, attempt: 1 })),
			when(odyssey, new CopyEdition(epub)),
			then(odyssey)
		)
	);

	it.effect("starts again when its file is replaced by another", () =>
		story(
			shelved("text"),
			given(
				odyssey,
				new CopyStarted({ ...epub, attempt: 1 }),
				new CopyFailed({ reason: "its text could not be read" })
			),
			when(odyssey, new CopyEdition({ ...epub, bytes: 2000 })),
			then(odyssey, new CopyStarted({ ...epub, bytes: 2000, attempt: 2 })),
			call(Copier.copy, asked(2)),
			succeed(Copier.copy, undefined)
		)
	);

	it.effect("is recorded when made, and the shelf says how long it is", () =>
		story(
			given(odyssey, new CopyStarted({ ...epub, attempt: 1 })),
			when(odyssey, new RecordCopy({ attempt: 1, chapters: 24 })),
			then(odyssey, new CopyMade({ chapters: 24 })),
			view(Shelf, SHELF, {
				copies: { "w-odyssey": { state: "made", note: "24 chapters" } },
			})
		)
	);

	it.effect("is recorded as failed, with its reason", () =>
		story(
			given(odyssey, new CopyStarted({ ...epub, attempt: 1 })),
			when(
				odyssey,
				new RecordCopyFailed({ attempt: 1, reason: "the share dropped out" })
			),
			then(odyssey, new CopyFailed({ reason: "the share dropped out" })),
			view(Shelf, SHELF, {
				copies: {
					"w-odyssey": { state: "failed", note: "the share dropped out" },
				},
			})
		)
	);

	it.effect("takes no answer to an earlier try", () =>
		story(
			given(
				odyssey,
				new CopyStarted({ ...epub, attempt: 1 }),
				new CopyStarted({ ...epub, attempt: 2 })
			),
			when(odyssey, new RecordCopy({ attempt: 1, chapters: 24 })),
			then(odyssey),
			when(odyssey, new RecordCopyFailed({ attempt: 1, reason: "late" })),
			then(odyssey)
		)
	);

	it.effect("can be made again", () =>
		story(
			shelved("text"),
			given(
				odyssey,
				new CopyStarted({ ...epub, attempt: 1 }),
				new CopyFailed({ reason: "the share dropped out" })
			),
			fromLaptop,
			when(odyssey, new RemakeCopy()),
			then(odyssey, new CopyStarted({ ...epub, attempt: 2 })),
			call(Copier.copy, asked(2)),
			succeed(Copier.copy, undefined),
			view(Shelf, SHELF, {
				copies: { "w-odyssey": { state: "copying", note: "copying, try 2" } },
			})
		)
	);

	it.effect("can't be made for a work with no edition alone", () =>
		story(
			fromLaptop,
			when(odyssey, new RemakeCopy()),
			rejected(new NothingToCopy())
		)
	);

	it.effect("is not asked of the press once the work has both editions", () =>
		story(
			shelved("text", "audio"),
			when(odyssey, new CopyEdition(epub)),
			then(odyssey, new CopyStarted({ ...epub, attempt: 1 }))
		)
	);

	it.effect("is made of the pages when the work has no text", () =>
		story(
			shelved("pages", "audio"),
			when(odyssey, new CopyEdition(pdf)),
			then(odyssey, new CopyStarted({ ...pdf, attempt: 1 })),
			call(Copier.copy, asked(1, pdf)),
			succeed(Copier.copy, undefined)
		)
	);

	it.effect(
		"is not asked of the press for the pages of a work with its text",
		() =>
			story(
				shelved("text", "pages"),
				when(odyssey, new CopyEdition(pdf)),
				then(odyssey, new CopyStarted({ ...pdf, attempt: 1 }))
			)
	);
});

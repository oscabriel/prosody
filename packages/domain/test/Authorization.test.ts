import { Story } from "@alchemy.run/domain/Story";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { AbandonGrab } from "../src/Acquisition/AbandonGrab.command.ts";
import { Downloads } from "../src/Acquisition/Downloads.external.ts";
import { Grab } from "../src/Acquisition/Grab.aggregate.ts";
import { GrabRelease } from "../src/Acquisition/GrabRelease.command.ts";
import { Indexer } from "../src/Acquisition/Indexer.external.ts";
import { ReleasesOffered } from "../src/Acquisition/OfferReleases.command.ts";
import { PayloadArrived } from "../src/Acquisition/RecordPayloadArrived.command.ts";
import { PayloadSeeded } from "../src/Acquisition/RecordSeeding.command.ts";
import type { Release } from "../src/Acquisition/Release.ts";
import { ReleasePayload } from "../src/Acquisition/ReleasePayload.command.ts";
import { ResumeGrab } from "../src/Acquisition/ResumeGrab.command.ts";
import { SearchAgain } from "../src/Acquisition/SearchAgain.command.ts";
import { DownloadStarted } from "../src/Acquisition/StartDownload.command.ts";
import { Want } from "../src/Acquisition/Want.aggregate.ts";
import {
	BookWanted,
	SearchStarted,
	WantBook,
} from "../src/Acquisition/WantBook.command.ts";
import {
	judgeWanted,
	Wanted,
	WantedLive,
} from "../src/Acquisition/Wanted.view.ts";
import { WithdrawWant } from "../src/Acquisition/WithdrawWant.command.ts";
import { Actor } from "../src/Actor.context.ts";
import type { ActorInfo } from "../src/Actor.context.ts";
import { WorkCatalogued } from "../src/Library/CatalogueWork.command.ts";
import { CorrectTitle } from "../src/Library/CorrectTitle.command.ts";
import { Metadata } from "../src/Library/Metadata.external.ts";
import {
	judgeShelf,
	SHELF,
	Shelf,
	ShelfLive,
} from "../src/Library/Shelf.view.ts";
import { Shelfmark } from "../src/Library/Shelfmark.ts";
import { Stacks } from "../src/Library/Stacks.external.ts";
import { Work } from "../src/Library/Work.aggregate.ts";
import { WorkId } from "../src/Library/Work.id.ts";
import { Aligner } from "../src/Narration/Aligner.external.ts";
import { Narration } from "../src/Narration/Narration.aggregate.ts";
import { EditionsPaired } from "../src/Narration/PairEditions.command.ts";
import { RealignNarration } from "../src/Narration/RealignNarration.command.ts";
import { Prosody, ProsodyHandlers } from "../src/Prosody.model.ts";
import { ReaderId, Role } from "../src/Reader.id.ts";
import { Copier } from "../src/Reading/Copier.external.ts";
import { Copy } from "../src/Reading/Copy.aggregate.ts";
import { CopyStarted } from "../src/Reading/CopyEdition.command.ts";
import {
	judgeNightstand,
	Nightstand,
	NightstandLive,
} from "../src/Reading/Nightstand.view.ts";
import { judgePlace, Place, PlaceLive } from "../src/Reading/Place.view.ts";
import { Reading } from "../src/Reading/Reading.aggregate.ts";
import {
	readerOf,
	ReadingId,
	readingOf,
	workOf,
} from "../src/Reading/Reading.id.ts";
import { RemakeCopy } from "../src/Reading/RemakeCopy.command.ts";
import { Forbidden } from "../src/Session.middleware.ts";

const { given, provide, rejected, when } = Story;

const story = Story.make(Prosody, {
	layer: ProsodyHandlers,
	stub: [Indexer, Downloads, Metadata, Stacks, Aligner, Copier],
});

const alice = ReaderId.make("u-alice");

const bob = ReaderId.make("u-bob");

const keeper = ReaderId.make("u-keeper");

const asReader = provide(Actor, {
	reader: alice,
	role: "reader",
	device: "iphone",
});

const book = { title: "Project Hail Mary", author: "Andy Weir" };

const release: Release = {
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

const hailMary = WorkId.make("w-hailmary");

const want = Want.ref(hailMary);

const grab = Grab.ref("w-hailmary.1");

const work = Work.ref(hailMary);

const shelfmark = Shelfmark.make("Andy Weir/Project Hail Mary");

const offered = given(
	want,
	new BookWanted(book),
	new SearchStarted({ search: 1 }),
	new ReleasesOffered({ releases: [release] })
);

const downloading = given(
	grab,
	new DownloadStarted({ work: hailMary, release })
);

describe("a reader who is not an admin", () => {
	it.effect("cannot want a book, even one already wanted", () =>
		story(
			asReader,
			when(want, new WantBook(book)),
			rejected(new Forbidden()),
			offered,
			when(want, new WantBook(book)),
			rejected(new Forbidden())
		)
	);

	it.effect("cannot withdraw a want", () =>
		story(
			offered,
			asReader,
			when(want, new WithdrawWant()),
			rejected(new Forbidden())
		)
	);

	it.effect("cannot search again", () =>
		story(
			offered,
			asReader,
			when(want, new SearchAgain()),
			rejected(new Forbidden())
		)
	);

	it.effect("cannot grab a release", () =>
		story(
			offered,
			asReader,
			when(want, new GrabRelease({ release: release.id })),
			rejected(new Forbidden())
		)
	);

	it.effect("cannot resume a grab", () =>
		story(
			downloading,
			asReader,
			when(grab, new ResumeGrab()),
			rejected(new Forbidden())
		)
	);

	it.effect("cannot abandon a grab", () =>
		story(
			downloading,
			asReader,
			when(grab, new AbandonGrab()),
			rejected(new Forbidden())
		)
	);

	it.effect("cannot release a payload it has seeded", () =>
		story(
			downloading,
			given(
				grab,
				new PayloadArrived({ payload: "Project Hail Mary" }),
				new PayloadSeeded({ hours: 72 })
			),
			asReader,
			when(grab, new ReleasePayload()),
			rejected(new Forbidden())
		)
	);

	it.effect("cannot correct a title", () =>
		story(
			given(
				work,
				new WorkCatalogued({ ...book, shelfmark: null, description: null })
			),
			asReader,
			when(work, new CorrectTitle({ title: "Hail Mary", author: book.author })),
			rejected(new Forbidden())
		)
	);

	it.effect("cannot align a narration again", () =>
		story(
			given(
				Narration.ref(hailMary),
				new EditionsPaired({
					shelfmark,
					text: "Project Hail Mary.epub",
					audio: "Project Hail Mary.m4b",
				})
			),
			asReader,
			when(Narration.ref(hailMary), new RealignNarration()),
			rejected(new Forbidden())
		)
	);

	it.effect("cannot remake a reading copy", () =>
		story(
			given(
				Copy.ref(hailMary),
				new CopyStarted({
					shelfmark,
					kind: "text",
					file: "Project Hail Mary.epub",
					bytes: 1000,
					attempt: 1,
				})
			),
			asReader,
			when(Copy.ref(hailMary), new RemakeCopy()),
			rejected(new Forbidden())
		)
	);
});

const actor = (reader: ReaderId, role: Role): ActorInfo => ({
	reader,
	role,
	device: "iphone",
});

const read = <Key>(key: Key) => ({ mode: "get" as const, key });

describe("who may read", () => {
	const carl = Reading.ref(readingOf(alice, WorkId.make("w-carl")));

	it.effect("a place, only its reader", () =>
		Effect.gen(function* () {
			yield* judgePlace(read(carl)).pipe(
				Effect.provideService(Actor, actor(alice, "reader"))
			);

			const errors = yield* Effect.forEach(
				[actor(bob, "reader"), actor(bob, "admin")],
				(who) =>
					Effect.flip(
						judgePlace(read(carl)).pipe(Effect.provideService(Actor, who))
					),
				{ concurrency: 1 }
			);

			assert.deepStrictEqual(errors, [new Forbidden(), new Forbidden()]);
		})
	);

	it.effect("a nightstand, only its reader", () =>
		Effect.gen(function* () {
			yield* judgeNightstand(read(alice)).pipe(
				Effect.provideService(Actor, actor(alice, "reader"))
			);

			const errors = yield* Effect.forEach(
				[actor(bob, "reader"), actor(bob, "admin")],
				(who) =>
					Effect.flip(
						judgeNightstand(read(alice)).pipe(Effect.provideService(Actor, who))
					),
				{ concurrency: 1 }
			);

			assert.deepStrictEqual(errors, [new Forbidden(), new Forbidden()]);
		})
	);

	it.effect("the desk, only an admin", () =>
		Effect.gen(function* () {
			yield* judgeWanted(read(SHELF)).pipe(
				Effect.provideService(Actor, actor(keeper, "admin"))
			);

			const error = yield* Effect.flip(
				judgeWanted(read(SHELF)).pipe(
					Effect.provideService(Actor, actor(alice, "reader"))
				)
			);

			assert.deepStrictEqual(error, new Forbidden());
		})
	);

	it.effect("the shelf, every reader", () =>
		Effect.forEach(
			[actor(keeper, "admin"), actor(alice, "reader")],
			(who) => judgeShelf(read(SHELF)).pipe(Effect.provideService(Actor, who)),
			{ concurrency: 1, discard: true }
		)
	);

	it.effect("each view with the judge its layer gives it", () =>
		Effect.gen(function* () {
			const judges = yield* Effect.all(
				[
					Place.Validator,
					Nightstand.Validator,
					Wanted.Validator,
					Shelf.Validator,
				],
				{ concurrency: 1 }
			);

			const expected: ReadonlyArray<unknown> = [
				judgePlace,
				judgeNightstand,
				judgeWanted,
				judgeShelf,
			];

			assert.deepStrictEqual(
				judges.map(({ validate }) => validate),
				expected
			);
		}).pipe(Effect.provide([PlaceLive, NightstandLive, WantedLive, ShelfLive]))
	);
});

describe("a reading's id", () => {
	const carl = WorkId.make("w-carl");

	it("joins a reader and a work, and parts back into both", () => {
		const id = readingOf(alice, carl);

		assert.strictEqual(id, "u-alice:w-carl");
		assert.strictEqual(readerOf(id), alice);
		assert.strictEqual(workOf(id), carl);
	});

	it("tells two readers of one work apart", () => {
		assert.notStrictEqual(readingOf(alice, carl), readingOf(bob, carl));
	});

	it("is a reader and a work, and nothing else", () => {
		const isReading = Schema.is(ReadingId);

		assert.isTrue(isReading("u-alice:w-carl"));
		assert.isFalse(isReading("w-carl"));
		assert.isFalse(isReading("u-alice"));
		assert.isFalse(isReading("u-alice/w-carl"));
		assert.isFalse(isReading("w-carl:u-alice"));
		assert.isFalse(isReading("u-alice:w-carl:w-odyssey"));
		assert.isFalse(isReading("u-Alice:w-carl"));
		assert.isFalse(isReading(":w-carl"));
	});
});

describe("a reader's id", () => {
	const isReader = Schema.is(ReaderId);

	it("starts with u- and holds lowercase letters and digits", () => {
		assert.isTrue(isReader("u-alice"));
		assert.isTrue(isReader("u-reader2"));
		assert.isFalse(isReader("alice"));
		assert.isFalse(isReader("w-alice"));
		assert.isFalse(isReader("u-"));
		assert.isFalse(isReader("u-al/ice"));
		assert.isFalse(isReader("u-alice:w-carl"));
	});

	it("is had by an admin or a reader", () => {
		const isRole = Schema.is(Role);

		assert.isTrue(isRole("admin"));
		assert.isTrue(isRole("reader"));
		assert.isFalse(isRole("guest"));
	});
});

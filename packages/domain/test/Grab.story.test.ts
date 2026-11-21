import { Story } from "@alchemy.run/domain/Story";
import { assert, describe, it } from "@effect/vitest";

import {
	AbandonGrab,
	GrabAbandoned,
	NotDownloading,
} from "../src/Acquisition/AbandonGrab.command.ts";
import {
	Downloads,
	DownloadsFailed,
} from "../src/Acquisition/Downloads.external.ts";
import { Grab } from "../src/Acquisition/Grab.aggregate.ts";
import { GrabId } from "../src/Acquisition/Grab.id.ts";
import {
	GrabRelease,
	ReleaseGrabbed,
	ReleaseNotOffered,
} from "../src/Acquisition/GrabRelease.command.ts";
import { Indexer } from "../src/Acquisition/Indexer.external.ts";
import { ReleasesOffered } from "../src/Acquisition/OfferReleases.command.ts";
import {
	PayloadNotShelved,
	RecordNotShelved,
} from "../src/Acquisition/RecordNotShelved.command.ts";
import {
	PayloadArrived,
	RecordPayloadArrived,
} from "../src/Acquisition/RecordPayloadArrived.command.ts";
import {
	DownloadProgressed,
	RecordProgress,
} from "../src/Acquisition/RecordProgress.command.ts";
import {
	PayloadSeeded,
	RecordSeeding,
} from "../src/Acquisition/RecordSeeding.command.ts";
import {
	PayloadShelved,
	RecordShelved,
} from "../src/Acquisition/RecordShelved.command.ts";
import {
	GrabStalled,
	RecordStall,
} from "../src/Acquisition/RecordStall.command.ts";
import type { Release } from "../src/Acquisition/Release.ts";
import {
	PayloadReleased,
	ReleasePayload,
	StillObligated,
} from "../src/Acquisition/ReleasePayload.command.ts";
import {
	GrabResumed,
	ResumeGrab,
} from "../src/Acquisition/ResumeGrab.command.ts";
import { DownloadStarted } from "../src/Acquisition/StartDownload.command.ts";
import { Want } from "../src/Acquisition/Want.aggregate.ts";
import {
	BookWanted,
	SearchStarted,
} from "../src/Acquisition/WantBook.command.ts";
import { Wanted } from "../src/Acquisition/Wanted.view.ts";
import {
	NotWanted,
	WantWithdrawn,
} from "../src/Acquisition/WithdrawWant.command.ts";
import { Device } from "../src/Device.context.ts";
import { WorkCatalogued } from "../src/Library/CatalogueWork.command.ts";
import { ShelfmarkClaimed } from "../src/Library/ClaimShelfmark.command.ts";
import { Metadata } from "../src/Library/Metadata.external.ts";
import { SHELF } from "../src/Library/Shelf.view.ts";
import { Shelfmark } from "../src/Library/Shelfmark.ts";
import { ShelfmarkClaim } from "../src/Library/ShelfmarkClaim.aggregate.ts";
import { Stacks } from "../src/Library/Stacks.external.ts";
import { Work } from "../src/Library/Work.aggregate.ts";
import { WorkId } from "../src/Library/Work.id.ts";
import { Aligner } from "../src/Narration/Aligner.external.ts";
import { Prosody, ProsodyHandlers } from "../src/Prosody.model.ts";
import { Copier } from "../src/Reading/Copier.external.ts";

const { call, fail, given, provide, rejected, succeed, then, view, when } =
	Story;

const story = Story.make(Prosody, {
	layer: ProsodyHandlers,
	stub: [Indexer, Downloads, Metadata, Stacks, Aligner, Copier],
});

const work = WorkId.make("w-hailmary");

const hailMary = Want.ref(work);

const grab = GrabId.make("w-hailmary.1");

const grabbed = Grab.ref(grab);

const shelfmark = Shelfmark.make("Andy Weir/Project Hail Mary");

const folder = ShelfmarkClaim.ref(shelfmark);

const catalogued = new WorkCatalogued({
	title: "Project Hail Mary",
	author: "Andy Weir",
	shelfmark: null,
	description: null,
});

const audiobook: Release = {
	id: "1_https://tracker.example/t/1",
	indexer: "Bookish",
	title: "Project Hail Mary - Andy Weir [M4B]",
	kind: "audio",
	bytes: 924_597_510,
	seeders: 41,
	published: "2021-05-04T00:00:00Z",
	page: "https://tracker.example/t/1",
	link: "/1/download?link=b25l&file=Project+Hail+Mary",
};

const offered = given(
	hailMary,
	new BookWanted({ title: "Project Hail Mary", author: "Andy Weir" }),
	new SearchStarted({ search: 1 }),
	new ReleasesOffered({ releases: [audiobook] })
);

const downloading = [
	offered,
	given(hailMary, new ReleaseGrabbed({ grab, release: audiobook })),
	given(grabbed, new DownloadStarted({ work, release: audiobook })),
] as const;

const seeded = (hours: number) =>
	[
		...downloading,
		given(
			grabbed,
			new PayloadArrived({ payload: "Project Hail Mary [M4B]" }),
			new PayloadSeeded({ hours })
		),
	] as const;

const fromLaptop = provide(Device, "laptop");

describe("a release you grab", () => {
	it.effect("is downloaded, and the desk shows it", () =>
		story(
			fromLaptop,
			offered,
			when(hailMary, new GrabRelease({ release: audiobook.id })),
			then(hailMary, new ReleaseGrabbed({ grab, release: audiobook })),
			then(grabbed, new DownloadStarted({ work, release: audiobook })),
			call(Downloads.download, { grab, release: audiobook }),
			succeed(Downloads.download, undefined),
			view(Wanted, SHELF, ({ grabs }) => {
				assert.deepStrictEqual(grabs[grab], {
					work,
					title: "Project Hail Mary",
					author: "Andy Weir",
					release: audiobook,
					state: "downloading",
					percent: 0,
					note: "",
					seeded: 0,
					arrived: null,
					shelf: null,
				});
			})
		)
	);

	it.effect("must be one the latest search offered", () =>
		story(
			fromLaptop,
			offered,
			when(hailMary, new GrabRelease({ release: "1_somewhere-else" })),
			rejected(new ReleaseNotOffered())
		)
	);

	it.effect("is not grabbed for a book no longer wanted, or twice", () =>
		story(
			fromLaptop,
			...downloading,
			when(hailMary, new GrabRelease({ release: audiobook.id })),
			then(hailMary),
			given(hailMary, new WantWithdrawn()),
			when(hailMary, new GrabRelease({ release: audiobook.id })),
			rejected(new NotWanted())
		)
	);

	it.effect("stalls when it can't be started, and is tried again", () =>
		story(
			fromLaptop,
			offered,
			when(hailMary, new GrabRelease({ release: audiobook.id })),
			then(hailMary, new ReleaseGrabbed({ grab, release: audiobook })),
			then(grabbed, new DownloadStarted({ work, release: audiobook })),
			call(Downloads.download, { grab, release: audiobook }),
			fail(
				Downloads.download,
				new DownloadsFailed({ reason: "qBittorrent did not answer" })
			),
			then(grabbed, new GrabStalled({ reason: "qBittorrent did not answer" })),
			when(grabbed, new ResumeGrab()),
			then(grabbed, new GrabResumed()),
			call(Downloads.download, { grab, release: audiobook }),
			succeed(Downloads.download, undefined)
		)
	);

	it.effect("records only more progress, and moving again ends a stall", () =>
		story(
			...downloading,
			when(grabbed, new RecordProgress({ percent: 40 })),
			then(grabbed, new DownloadProgressed({ percent: 40 })),
			when(grabbed, new RecordProgress({ percent: 40 })),
			then(grabbed),
			when(
				grabbed,
				new RecordStall({ reason: "nothing came for half an hour" })
			),
			then(
				grabbed,
				new GrabStalled({ reason: "nothing came for half an hour" })
			),
			when(
				grabbed,
				new RecordStall({ reason: "nothing came for half an hour" })
			),
			then(grabbed),
			when(grabbed, new RecordProgress({ percent: 41 })),
			then(grabbed, new DownloadProgressed({ percent: 41 })),
			view(Wanted, SHELF, ({ grabs }) => {
				assert.strictEqual(grabs[grab]?.state, "downloading");
				assert.strictEqual(grabs[grab]?.percent, 41);
			})
		)
	);

	it.effect("is resumed or abandoned only while it downloads", () =>
		story(
			fromLaptop,
			...downloading,
			when(grabbed, new ResumeGrab()),
			then(grabbed, new GrabResumed()),
			call(Downloads.download, { grab, release: audiobook }),
			succeed(Downloads.download, undefined),
			when(grabbed, new AbandonGrab()),
			then(grabbed, new GrabAbandoned()),
			view(Wanted, SHELF, ({ grabs }) => {
				assert.deepStrictEqual(grabs, {});
			}),
			when(grabbed, new RecordPayloadArrived({ payload: "Project Hail Mary" })),
			then(grabbed),
			when(grabbed, new ResumeGrab()),
			rejected(new NotDownloading({ status: "abandoned" })),
			when(grabbed, new AbandonGrab()),
			rejected(new NotDownloading({ status: "abandoned" })),
			when(grabbed, new ReleasePayload()),
			rejected(new NotDownloading({ status: "abandoned" }))
		)
	);

	it.effect("is not resumed or abandoned once its payload has come", () =>
		story(
			fromLaptop,
			...seeded(10),
			when(grabbed, new ResumeGrab()),
			rejected(new NotDownloading({ status: "arrived" })),
			when(grabbed, new AbandonGrab()),
			rejected(new NotDownloading({ status: "arrived" }))
		)
	);

	it.effect("is shelved in its work's folder when its payload arrives", () =>
		story(
			...downloading,
			given(Work.ref(work), catalogued),
			when(
				grabbed,
				new RecordPayloadArrived({ payload: "Project Hail Mary [M4B]" })
			),
			then(grabbed, new PayloadArrived({ payload: "Project Hail Mary [M4B]" })),
			then(folder, new ShelfmarkClaimed({ work })),
			call(Stacks.shelve, {
				grab,
				work,
				kind: "audio",
				payload: "Project Hail Mary [M4B]",
				shelfmark,
			}),
			succeed(Stacks.shelve, undefined),
			when(
				grabbed,
				new RecordNotShelved({ reason: "The library did not answer." })
			),
			then(
				grabbed,
				new PayloadNotShelved({ reason: "The library did not answer." })
			),
			when(
				grabbed,
				new RecordNotShelved({ reason: "The library did not answer." })
			),
			then(grabbed),
			when(
				grabbed,
				new RecordShelved({
					work,
					shelfmark,
				})
			),
			then(
				grabbed,
				new PayloadShelved({
					work,
					shelfmark,
				})
			),
			view(Wanted, SHELF, ({ grabs }) => {
				assert.deepStrictEqual(grabs[grab]?.shelf, {
					work,
					shelfmark,
				});
				assert.strictEqual(grabs[grab]?.note, "");
			})
		)
	);

	it.effect(
		"goes in the folder of the work that holds it, as that work's edition",
		() =>
			story(
				...downloading,
				given(
					Work.ref(work),
					new WorkCatalogued({
						title: "Project Hail Mary",
						author: "Andy Weir",
						shelfmark: null,
						description: null,
					})
				),
				given(folder, new ShelfmarkClaimed({ work: WorkId.make("w-found") })),
				when(grabbed, new RecordPayloadArrived({ payload: "phm.m4b" })),
				then(grabbed, new PayloadArrived({ payload: "phm.m4b" })),
				call(Stacks.shelve, {
					grab,
					work: WorkId.make("w-found"),
					kind: "audio",
					payload: "phm.m4b",
					shelfmark,
				}),
				succeed(Stacks.shelve, undefined)
			)
	);

	it.effect(
		"of a work catalogued before works kept their names, is named as the catalogues name it",
		() =>
			story(
				...downloading,
				when(grabbed, new RecordPayloadArrived({ payload: "phm.m4b" })),
				then(grabbed, new PayloadArrived({ payload: "phm.m4b" })),
				call(Metadata.describe, {
					title: "Project Hail Mary",
					author: "Andy Weir",
				}),
				succeed(Metadata.describe, {
					title: "Project Hail Mary",
					author: "Andy Weir",
					description: { year: 2021, openLibrary: null, recording: null },
				}),
				then(folder, new ShelfmarkClaimed({ work })),
				call(Stacks.shelve, {
					grab,
					work,
					kind: "audio",
					payload: "phm.m4b",
					shelfmark,
				}),
				succeed(Stacks.shelve, undefined)
			)
	);

	it.effect("records only more hours seeded", () =>
		story(
			...seeded(10),
			when(grabbed, new RecordSeeding({ hours: 9 })),
			then(grabbed),
			when(grabbed, new RecordSeeding({ hours: 11 })),
			then(grabbed, new PayloadSeeded({ hours: 11 }))
		)
	);

	it.effect("is not released until its payload has seeded 72 hours", () =>
		story(
			fromLaptop,
			...seeded(30),
			when(grabbed, new ReleasePayload()),
			rejected(new StillObligated({ hours: 42 }))
		)
	);

	it.effect("owes every hour while it downloads", () =>
		story(
			fromLaptop,
			...downloading,
			when(grabbed, new ReleasePayload()),
			rejected(new StillObligated({ hours: 72 }))
		)
	);

	it.effect("is not released when it was never grabbed", () =>
		story(
			fromLaptop,
			when(Grab.ref(GrabId.make("w-hailmary.9")), new ReleasePayload()),
			rejected(new NotDownloading({ status: "none" }))
		)
	);

	it.effect("is released once seeded, and leaves Downloads and the desk", () =>
		story(
			fromLaptop,
			...seeded(72),
			when(grabbed, new ReleasePayload()),
			then(grabbed, new PayloadReleased()),
			call(Downloads.remove, { grab }),
			succeed(Downloads.remove, undefined),
			view(Wanted, SHELF, ({ grabs }) => {
				assert.deepStrictEqual(grabs, {});
			}),
			when(grabbed, new ReleasePayload()),
			then(grabbed)
		)
	);
});

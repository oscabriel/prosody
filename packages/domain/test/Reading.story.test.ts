import { Story } from "@alchemy.run/domain/Story";
import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import { Downloads } from "../src/Acquisition/Downloads.external.ts";
import { Indexer } from "../src/Acquisition/Indexer.external.ts";
import { Actor } from "../src/Actor.context.ts";
import { Metadata } from "../src/Library/Metadata.external.ts";
import { Stacks } from "../src/Library/Stacks.external.ts";
import { WorkId } from "../src/Library/Work.id.ts";
import { Aligner } from "../src/Narration/Aligner.external.ts";
import { Prosody, ProsodyHandlers } from "../src/Prosody.model.ts";
import type { Role } from "../src/Reader.id.ts";
import { ReaderId } from "../src/Reader.id.ts";
import { Copier } from "../src/Reading/Copier.external.ts";
import { BookFinished, FinishBook } from "../src/Reading/FinishBook.command.ts";
import {
	KeepPlace,
	PlaceKept,
	StalePlace,
} from "../src/Reading/KeepPlace.command.ts";
import { Nightstand } from "../src/Reading/Nightstand.view.ts";
import { BookOpened, OpenBook } from "../src/Reading/OpenBook.command.ts";
import { Place } from "../src/Reading/Place.view.ts";
import { Reading } from "../src/Reading/Reading.aggregate.ts";
import { readingOf } from "../src/Reading/Reading.id.ts";
import { Sentence } from "../src/Reading/Sentence.ts";
import {
	BookSetAside,
	NotReading,
	SetAside,
} from "../src/Reading/SetAside.command.ts";
import { Forbidden } from "../src/Session.middleware.ts";

const { given, provide, rejected, then, view, when } = Story;

const story = Story.make(Prosody, {
	layer: ProsodyHandlers,
	stub: [Indexer, Downloads, Metadata, Stacks, Aligner, Copier],
});

const alice = ReaderId.make("u-alice");

const bob = ReaderId.make("u-bob");

const reading = (reader: ReaderId, work: string) =>
	Reading.ref(readingOf(reader, WorkId.make(work)));

const carl = reading(alice, "w-carl");

const wonderland = reading(alice, "w-alice");

const sentence = (id: string) =>
	Sentence.make(`OEBPS/Text/part0007.xhtml#${id}`);

const place = (id: string, at: number) => ({
	sentence: sentence(id),
	time: null,
	page: null,
	at,
});

const heard = (time: number, at: number) => ({
	sentence: null,
	time,
	page: null,
	at,
});

const evans = reading(alice, "w-evans");

const turned = (page: number, at: number) => ({
	sentence: null,
	time: null,
	page,
	at,
});

const kept = (id: string, at: number, device: string) => ({
	...place(id, at),
	device,
});

const as = (reader: ReaderId, device: string, role: Role = "reader") =>
	provide(Actor, { reader, role, device });

const fromPhone = as(alice, "iphone");

const fromLaptop = as(alice, "laptop");

describe("your place in a work", () => {
	it.effect(
		"is kept with the device that sent it, and every device can see it",
		() =>
			story(
				fromPhone,
				when(carl, new KeepPlace(place("ps-12", 1000))),
				then(carl, new PlaceKept(kept("ps-12", 1000, "iphone"))),
				view(Place, carl, { place: kept("ps-12", 1000, "iphone") })
			)
	);

	it.effect("moves with the newest place, whichever device kept it", () =>
		story(
			given(carl, new PlaceKept(kept("ps-12", 1000, "iphone"))),
			fromLaptop,
			when(carl, new KeepPlace(place("ps-40", 2000))),
			then(carl, new PlaceKept(kept("ps-40", 2000, "laptop"))),
			view(Place, carl, { place: kept("ps-40", 2000, "laptop") })
		)
	);

	it.effect("is not moved back by a place kept earlier", () =>
		story(
			given(carl, new PlaceKept(kept("ps-40", 2000, "laptop"))),
			fromPhone,
			when(carl, new KeepPlace(place("ps-12", 1000))),
			rejected(new StalePlace({ keptAt: 2000 }))
		)
	);

	it.effect("records nothing when the same place is sent again", () =>
		story(
			given(carl, new PlaceKept(kept("ps-12", 1000, "iphone"))),
			fromPhone,
			when(carl, new KeepPlace(place("ps-12", 1000))),
			then(carl)
		)
	);

	it.effect("in a work with audio alone, is a time in the audio", () =>
		story(
			fromPhone,
			when(wonderland, new KeepPlace(heard(1376.4, 1000))),
			then(
				wonderland,
				new PlaceKept({ ...heard(1376.4, 1000), device: "iphone" })
			),
			view(Place, wonderland, {
				place: { ...heard(1376.4, 1000), device: "iphone" },
			})
		)
	);

	it.effect("records nothing when the same time is sent again", () =>
		story(
			given(
				wonderland,
				new PlaceKept({ ...heard(1376.4, 1000), device: "iphone" })
			),
			fromPhone,
			when(wonderland, new KeepPlace(heard(1376.4, 1000))),
			then(wonderland)
		)
	);

	it.effect("in a work made of pages, is a page", () =>
		story(
			given(evans, new PlaceKept({ ...turned(41, 1000), device: "iphone" })),
			fromLaptop,
			when(evans, new KeepPlace(turned(42, 2000))),
			then(evans, new PlaceKept({ ...turned(42, 2000), device: "laptop" })),
			view(Place, evans, {
				place: { ...turned(42, 2000), device: "laptop" },
			}),
			when(evans, new KeepPlace(turned(42, 2000))),
			then(evans)
		)
	);
});

const odyssey = reading(alice, "w-odyssey");

describe("the nightstand", () => {
	it.effect("takes a work when it is first opened", () =>
		story(
			fromPhone,
			when(carl, new OpenBook({ at: 1000 })),
			then(carl, new BookOpened({ at: 1000, device: "iphone" })),
			view(Nightstand, alice, {
				works: { "w-carl": { stage: "reading", at: 1000, device: "iphone" } },
			})
		)
	);

	it.effect("records nothing when a work on it is opened again", () =>
		story(
			given(carl, new BookOpened({ at: 1000, device: "iphone" })),
			fromLaptop,
			when(carl, new OpenBook({ at: 2000 })),
			then(carl)
		)
	);

	it.effect("moves a work up as you read on, on any device", () =>
		story(
			given(carl, new BookOpened({ at: 1000, device: "iphone" })),
			given(odyssey, new BookOpened({ at: 1500, device: "iphone" })),
			fromLaptop,
			when(carl, new KeepPlace(place("ps-12", 2000))),
			then(carl, new PlaceKept(kept("ps-12", 2000, "laptop"))),
			view(Nightstand, alice, {
				works: {
					"w-carl": { stage: "reading", at: 2000, device: "laptop" },
					"w-odyssey": { stage: "reading", at: 1500, device: "iphone" },
				},
			})
		)
	);

	it.effect("takes a work read before it existed when it is next opened", () =>
		story(
			given(carl, new PlaceKept(kept("ps-12", 1000, "iphone"))),
			fromPhone,
			when(carl, new OpenBook({ at: 2000 })),
			then(carl, new BookOpened({ at: 2000, device: "iphone" })),
			view(Nightstand, alice, {
				works: { "w-carl": { stage: "reading", at: 2000, device: "iphone" } },
			})
		)
	);

	it.effect("lets a work go when you finish it", () =>
		story(
			given(carl, new BookOpened({ at: 1000, device: "iphone" })),
			fromLaptop,
			when(carl, new FinishBook({ at: 2000 })),
			then(carl, new BookFinished({ at: 2000, device: "laptop" })),
			view(Nightstand, alice, {
				works: { "w-carl": { stage: "finished", at: 2000, device: "laptop" } },
			})
		)
	);

	it.effect("keeps a finished work finished while the audio plays on", () =>
		story(
			given(carl, new BookFinished({ at: 2000, device: "laptop" })),
			fromPhone,
			when(carl, new KeepPlace(place("ps-40", 3000))),
			then(carl, new PlaceKept(kept("ps-40", 3000, "iphone"))),
			view(Nightstand, alice, {
				works: { "w-carl": { stage: "finished", at: 2000, device: "laptop" } },
			})
		)
	);

	it.effect("puts a work set aside back on it when it is opened", () =>
		story(
			given(carl, new BookOpened({ at: 1000, device: "iphone" })),
			fromPhone,
			when(carl, new SetAside({ at: 2000 })),
			then(carl, new BookSetAside({ at: 2000, device: "iphone" })),
			when(carl, new OpenBook({ at: 3000 })),
			then(carl, new BookOpened({ at: 3000, device: "iphone" })),
			view(Nightstand, alice, {
				works: { "w-carl": { stage: "reading", at: 3000, device: "iphone" } },
			})
		)
	);

	it.effect("cannot set aside a work that is not on it", () =>
		story(
			given(carl, new BookFinished({ at: 2000, device: "laptop" })),
			fromPhone,
			when(carl, new SetAside({ at: 3000 })),
			rejected(new NotReading({ stage: "finished" }))
		)
	);
});

describe("a reading kept before", () => {
	it("the nightstand is a work not yet opened", () => {
		const state = Schema.decodeSync(Reading.definition.state)({
			place: kept("ps-12", 1000, "iphone"),
		});

		expect(state.stage).toBe("unopened");
	});

	it("there were times or pages keeps its sentence, and neither", () => {
		const state = Schema.decodeSync(Reading.definition.state)({
			place: { sentence: sentence("ps-12"), at: 1000, device: "iphone" },
		});

		expect(state.place).toStrictEqual(kept("ps-12", 1000, "iphone"));
	});
});

const bobsCarl = reading(bob, "w-carl");

const bobsPhone = as(bob, "pixel");

describe("two readers of one work", () => {
	it.effect("each keep their own place and their own nightstand", () =>
		story(
			fromPhone,
			when(carl, new OpenBook({ at: 1000 })),
			then(carl, new BookOpened({ at: 1000, device: "iphone" })),
			when(carl, new KeepPlace(place("ps-12", 1500))),
			then(carl, new PlaceKept(kept("ps-12", 1500, "iphone"))),
			bobsPhone,
			when(bobsCarl, new OpenBook({ at: 2000 })),
			then(bobsCarl, new BookOpened({ at: 2000, device: "pixel" })),
			when(bobsCarl, new KeepPlace(place("ps-3", 2500))),
			then(bobsCarl, new PlaceKept(kept("ps-3", 2500, "pixel"))),
			view(Place, carl, { place: kept("ps-12", 1500, "iphone") }),
			view(Place, bobsCarl, { place: kept("ps-3", 2500, "pixel") }),
			view(Nightstand, alice, {
				works: { "w-carl": { stage: "reading", at: 1500, device: "iphone" } },
			}),
			view(Nightstand, bob, {
				works: { "w-carl": { stage: "reading", at: 2500, device: "pixel" } },
			})
		)
	);

	it.effect("do not judge one place stale by the other's", () =>
		story(
			given(carl, new PlaceKept(kept("ps-40", 3000, "iphone"))),
			bobsPhone,
			when(bobsCarl, new KeepPlace(place("ps-12", 1000))),
			then(bobsCarl, new PlaceKept(kept("ps-12", 1000, "pixel"))),
			view(Place, carl, { place: kept("ps-40", 3000, "iphone") })
		)
	);

	it.effect("finish and set aside without moving the other's", () =>
		story(
			given(carl, new BookOpened({ at: 1000, device: "iphone" })),
			given(bobsCarl, new BookOpened({ at: 1100, device: "pixel" })),
			fromPhone,
			when(carl, new FinishBook({ at: 2000 })),
			then(carl, new BookFinished({ at: 2000, device: "iphone" })),
			view(Nightstand, bob, {
				works: { "w-carl": { stage: "reading", at: 1100, device: "pixel" } },
			}),
			bobsPhone,
			when(bobsCarl, new SetAside({ at: 3000 })),
			then(bobsCarl, new BookSetAside({ at: 3000, device: "pixel" })),
			view(Nightstand, alice, {
				works: { "w-carl": { stage: "finished", at: 2000, device: "iphone" } },
			}),
			view(Nightstand, bob, {
				works: { "w-carl": { stage: "setAside", at: 3000, device: "pixel" } },
			})
		)
	);
});

describe("another reader's reading", () => {
	it.effect("cannot have its place kept", () =>
		story(
			given(carl, new PlaceKept(kept("ps-12", 1000, "iphone"))),
			bobsPhone,
			when(carl, new KeepPlace(place("ps-12", 1000))),
			rejected(new Forbidden()),
			when(carl, new KeepPlace(place("ps-40", 2000))),
			rejected(new Forbidden()),
			view(Place, carl, { place: kept("ps-12", 1000, "iphone") })
		)
	);

	it.effect("cannot be opened, even when it is already open", () =>
		story(
			bobsPhone,
			when(carl, new OpenBook({ at: 1000 })),
			rejected(new Forbidden()),
			given(carl, new BookOpened({ at: 1000, device: "iphone" })),
			when(carl, new OpenBook({ at: 2000 })),
			rejected(new Forbidden())
		)
	);

	it.effect("cannot be finished", () =>
		story(
			given(carl, new BookOpened({ at: 1000, device: "iphone" })),
			bobsPhone,
			when(carl, new FinishBook({ at: 2000 })),
			rejected(new Forbidden()),
			view(Nightstand, alice, {
				works: { "w-carl": { stage: "reading", at: 1000, device: "iphone" } },
			})
		)
	);

	it.effect("cannot be set aside, whatever its stage", () =>
		story(
			bobsPhone,
			when(carl, new SetAside({ at: 1000 })),
			rejected(new Forbidden()),
			given(carl, new BookOpened({ at: 1000, device: "iphone" })),
			when(carl, new SetAside({ at: 2000 })),
			rejected(new Forbidden())
		)
	);

	it.effect("is not open to an admin either", () =>
		story(
			as(bob, "laptop", "admin"),
			when(carl, new OpenBook({ at: 1000 })),
			rejected(new Forbidden()),
			when(carl, new KeepPlace(place("ps-12", 1000))),
			rejected(new Forbidden())
		)
	);
});

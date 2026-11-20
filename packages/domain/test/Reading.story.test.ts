import { Story } from "@alchemy.run/domain/Story";
import { describe, it } from "@effect/vitest";

import { Device } from "../src/Device.context.ts";
import { Aligner } from "../src/Narration/Aligner.external.ts";
import { Prosody, ProsodyHandlers } from "../src/Prosody.model.ts";
import {
	KeepPlace,
	PlaceKept,
	StalePlace,
} from "../src/Reading/KeepPlace.command.ts";
import { Place } from "../src/Reading/Place.view.ts";
import { Reading } from "../src/Reading/Reading.aggregate.ts";
import { Sentence } from "../src/Reading/Sentence.ts";

const { given, provide, rejected, then, view, when } = Story;

// The model's one policy calls the Aligner. Nothing here starts a try, so it is never called.
const story = Story.make(Prosody, {
	layer: ProsodyHandlers,
	stub: [Aligner],
});

const carl = Reading.ref("w-carl");

const sentence = (id: string) =>
	Sentence.make(`OEBPS/Text/part0007.xhtml#${id}`);

/** A place as a device sends it: the sentence and when. */
const place = (id: string, at: number) => ({ sentence: sentence(id), at });

/** The same place as the model keeps it, with the device the Session said sent it. */
const kept = (id: string, at: number, device: string) => ({
	...place(id, at),
	device,
});

const fromPhone = provide(Device, "iphone");

const fromLaptop = provide(Device, "laptop");

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
});

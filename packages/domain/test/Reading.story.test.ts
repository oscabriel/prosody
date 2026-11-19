import { Story } from "@alchemy.run/domain/Story";
import { describe, it } from "@effect/vitest";

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

const { given, rejected, then, view, when } = Story;

// The model's one policy calls the Aligner. Nothing here starts a try, so it is never called.
const story = Story.make(Prosody, {
	layer: ProsodyHandlers,
	stub: [Aligner],
});

const carl = Reading.ref("w-carl");

const kept = (sentence: string, at: number, device: string) => ({
	sentence: Sentence.make(`OEBPS/Text/part0007.xhtml#${sentence}`),
	at,
	device,
});

const onPhone = kept("ps-12", 1000, "iPhone");

describe("your place in a work", () => {
	it.effect("is kept, and every device can see it", () =>
		story(
			when(carl, new KeepPlace(onPhone)),
			then(carl, new PlaceKept(onPhone)),
			view(Place, carl, { place: onPhone })
		)
	);

	it.effect("moves with the newest place, whichever device kept it", () => {
		const onLaptop = kept("ps-40", 2000, "Linux");

		return story(
			given(carl, new PlaceKept(onPhone)),
			when(carl, new KeepPlace(onLaptop)),
			then(carl, new PlaceKept(onLaptop)),
			view(Place, carl, { place: onLaptop })
		);
	});

	it.effect("is not moved back by a place kept earlier", () =>
		story(
			given(carl, new PlaceKept(kept("ps-40", 2000, "Linux"))),
			when(carl, new KeepPlace(onPhone)),
			rejected(new StalePlace({ keptAt: 2000 }))
		)
	);

	it.effect("records nothing when the same place is sent again", () =>
		story(
			given(carl, new PlaceKept(onPhone)),
			when(carl, new KeepPlace(onPhone)),
			then(carl)
		)
	);
});

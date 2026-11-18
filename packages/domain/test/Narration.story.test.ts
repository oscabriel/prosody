import { Story } from "@alchemy.run/domain/Story";
import { describe, it } from "@effect/vitest";

import { SHELF, Shelf } from "../src/Library/Shelf.view.ts";
import { Shelfmark } from "../src/Library/Shelfmark.ts";
import { ExpireAlignment } from "../src/Narration/ExpireAlignment.command.ts";
import { Narration } from "../src/Narration/Narration.aggregate.ts";
import {
	AlignmentStarted,
	EditionsPaired,
	PairEditions,
} from "../src/Narration/PairEditions.command.ts";
import {
	AlreadyAligning,
	NotPaired,
	RealignNarration,
} from "../src/Narration/RealignNarration.command.ts";
import {
	NarrationAligned,
	RecordAlignment,
} from "../src/Narration/RecordAlignment.command.ts";
import {
	AlignmentFailed,
	RecordAlignmentFailed,
} from "../src/Narration/RecordAlignmentFailed.command.ts";
import { Prosody, ProsodyHandlers } from "../src/Prosody.model.ts";

const { given, rejected, then, view, when } = Story;

const story = Story.make(Prosody, { layer: ProsodyHandlers });

const carl = Narration.ref("w-carl");

const pair = {
	shelfmark: Shelfmark.make("Matt Dinniman/Dungeon Crawler Carl"),
	text: "Dungeon Crawler Carl - Matt Dinniman.epub",
	audio: "Matt Dinniman - Dungeon Crawler Carl.m4b",
};

const aligned = {
	sentences: 13_390,
	matched: 13_048,
	checked: 40,
	heard: 39,
};

describe("the narration", () => {
	it.effect("a pair starts its first try", () =>
		story(
			when(carl, new PairEditions(pair)),
			then(
				carl,
				new EditionsPaired(pair),
				new AlignmentStarted({ attempt: 1 })
			),
			view(Shelf, SHELF, {
				syncs: { "w-carl": { state: "syncing", note: "aligning" } },
			})
		)
	);

	it.effect("pairing again records nothing", () =>
		story(
			given(
				carl,
				new EditionsPaired(pair),
				new AlignmentStarted({ attempt: 1 })
			),
			when(carl, new PairEditions(pair)),
			then(carl)
		)
	);

	it.effect("a finished try is recorded, and the shelf says how it went", () =>
		story(
			given(
				carl,
				new EditionsPaired(pair),
				new AlignmentStarted({ attempt: 1 })
			),
			when(carl, new RecordAlignment({ attempt: 1, ...aligned })),
			then(carl, new NarrationAligned(aligned)),
			view(Shelf, SHELF, {
				syncs: {
					"w-carl": {
						state: "synced",
						note: "97% of sentences found in the audio; 39 of 40 spot checks heard right",
					},
				},
			})
		)
	);

	it.effect("a failure is recorded with its reason", () =>
		story(
			given(
				carl,
				new EditionsPaired(pair),
				new AlignmentStarted({ attempt: 1 })
			),
			when(
				carl,
				new RecordAlignmentFailed({
					attempt: 1,
					reason: "its audio is xHE-AAC, which ffmpeg can't decode whole",
				})
			),
			then(
				carl,
				new AlignmentFailed({
					reason: "its audio is xHE-AAC, which ffmpeg can't decode whole",
				})
			)
		)
	);

	it.effect("an answer to an earlier try changes nothing", () =>
		story(
			given(
				carl,
				new EditionsPaired(pair),
				new AlignmentStarted({ attempt: 1 }),
				new AlignmentFailed({ reason: "the share dropped out" }),
				new AlignmentStarted({ attempt: 2 })
			),
			when(carl, new RecordAlignment({ attempt: 1, ...aligned })),
			then(carl),
			when(carl, new ExpireAlignment({ attempt: 1 })),
			then(carl)
		)
	);

	it.effect("a failed book can be tried again", () =>
		story(
			given(
				carl,
				new EditionsPaired(pair),
				new AlignmentStarted({ attempt: 1 }),
				new AlignmentFailed({ reason: "the share dropped out" })
			),
			when(carl, new RealignNarration()),
			then(carl, new AlignmentStarted({ attempt: 2 })),
			view(Shelf, SHELF, {
				syncs: { "w-carl": { state: "syncing", note: "aligning, try 2" } },
			})
		)
	);

	it.effect("a try can't start while one is running", () =>
		story(
			given(
				carl,
				new EditionsPaired(pair),
				new AlignmentStarted({ attempt: 1 })
			),
			when(carl, new RealignNarration()),
			rejected(new AlreadyAligning())
		)
	);

	it.effect("a work with no pair can't be aligned", () =>
		story(when(carl, new RealignNarration()), rejected(new NotPaired()))
	);
});

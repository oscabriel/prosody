import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Reading } from "./Reading.aggregate.ts";
import { Bookmark } from "./Sentence.ts";

/** Your place in each work. Every device watches it, so reading on one moves the others. */
export class Place extends Domain.View("Place", {
	from: [Reading],
	key: Reading,
	state: Schema.Struct({ place: Schema.NullOr(Bookmark) }),
	initial: { place: null },
	evolve: {
		PlaceKept: (_state, e) => ({
			place: { sentence: e.sentence, at: e.at, device: e.device },
		}),
	},
}) {}

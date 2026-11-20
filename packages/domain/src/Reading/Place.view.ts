import * as Domain from "@alchemy.run/domain";
import { Effect, Schema } from "effect";

import { Session } from "../Session.middleware.ts";
import { Reading } from "./Reading.aggregate.ts";
import { Bookmark } from "./Sentence.ts";

/** Your place in each work. Every device watches it, so reading on one moves the others. */
export class Place extends Domain.View("Place", {
	from: [Reading],
	key: Reading,
	middleware: [Session],
	state: Schema.Struct({ place: Schema.NullOr(Bookmark) }),
	initial: { place: null },
	evolve: {
		PlaceKept: (_state, e) => ({
			place: {
				sentence: e.sentence,
				time: e.time,
				page: e.page,
				at: e.at,
				device: e.device,
			},
		}),
	},
}) {}

/** Any of your devices may read your place; the Session lets in no one else. */
export const PlaceLive = Place.toLayer(Effect.succeed(() => Effect.void));

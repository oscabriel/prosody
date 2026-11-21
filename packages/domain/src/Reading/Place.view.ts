import * as Domain from "@alchemy.run/domain";
import { Effect, Schema } from "effect";

import { Session } from "../Session.middleware.ts";
import { Reading } from "./Reading.aggregate.ts";
import { KeptPlace } from "./Sentence.ts";

export class Place extends Domain.View("Place", {
	from: [Reading],
	key: Reading,
	middleware: [Session],
	state: Schema.Struct({ place: Schema.NullOr(KeptPlace) }),
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

export const PlaceLive = Place.toLayer(Effect.succeed(() => Effect.void));

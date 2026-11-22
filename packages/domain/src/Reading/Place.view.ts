import * as Domain from "@alchemy.run/domain";
import { Effect, Schema } from "effect";

import { asReader, Forbidden, Session } from "../Session.middleware.ts";
import { Reading } from "./Reading.aggregate.ts";
import { readerOf } from "./Reading.id.ts";
import { KeptPlace } from "./Sentence.ts";

export class Place extends Domain.View("Place", {
	from: [Reading],
	key: Reading,
	middleware: [Session],
	rejects: [Forbidden],
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

export const judgePlace = Effect.fn(function* (
	request: Domain.Read.Request<Domain.Aggregate.Ref<typeof Reading>>
) {
	yield* asReader(readerOf(request.key.id));
});

export const PlaceLive = Place.toLayer(Effect.succeed(judgePlace));

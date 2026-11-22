import * as Domain from "@alchemy.run/domain";
import { Effect, Schema } from "effect";

import { ReaderId } from "../Reader.id.ts";
import { asReader, Forbidden, Session } from "../Session.middleware.ts";
import { Reading } from "./Reading.aggregate.ts";
import { readerOf, workOf } from "./Reading.id.ts";
import { Moment, Stage } from "./Stage.ts";

export const Standing = Schema.Struct({ stage: Stage, ...Moment.fields });

export type Standing = typeof Standing.Type;

const to = (stage: Stage, { at, device }: Moment): Standing => ({
	stage,
	at,
	device,
});

export class Nightstand extends Domain.View("Nightstand", {
	from: [Reading],
	key: ReaderId,
	middleware: [Session],
	rejects: [Forbidden],
	keyOf: { Reading: ({ source }) => readerOf(source.id) },
	state: Schema.Struct({ works: Schema.Record(Schema.String, Standing) }),
	initial: { works: {} },
	evolve: {
		PlaceKept: (stand, e, { source }) => {
			const work = workOf(source.id);

			return stand.works[work]?.stage === "reading"
				? { works: { ...stand.works, [work]: to("reading", e) } }
				: stand;
		},
		BookOpened: (stand, e, { source }) => ({
			works: { ...stand.works, [workOf(source.id)]: to("reading", e) },
		}),
		BookFinished: (stand, e, { source }) => ({
			works: { ...stand.works, [workOf(source.id)]: to("finished", e) },
		}),
		BookSetAside: (stand, e, { source }) => ({
			works: { ...stand.works, [workOf(source.id)]: to("setAside", e) },
		}),
	},
}) {}

export const judgeNightstand = Effect.fn(function* (
	request: Domain.Read.Request<ReaderId>
) {
	yield* asReader(request.key);
});

export const NightstandLive = Nightstand.toLayer(
	Effect.succeed(judgeNightstand)
);

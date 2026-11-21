import * as Domain from "@alchemy.run/domain";
import { Effect, Schema } from "effect";

import { SHELF, ShelfName } from "../Library/Shelf.view.ts";
import { Session } from "../Session.middleware.ts";
import { Reading } from "./Reading.aggregate.ts";
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
	key: ShelfName,
	middleware: [Session],
	keyOf: { Reading: () => SHELF },
	state: Schema.Struct({ works: Schema.Record(Schema.String, Standing) }),
	initial: { works: {} },
	evolve: {
		PlaceKept: (stand, e, { source }) =>
			stand.works[source.id]?.stage === "reading"
				? { works: { ...stand.works, [source.id]: to("reading", e) } }
				: stand,
		BookOpened: (stand, e, { source }) => ({
			works: { ...stand.works, [source.id]: to("reading", e) },
		}),
		BookFinished: (stand, e, { source }) => ({
			works: { ...stand.works, [source.id]: to("finished", e) },
		}),
		BookSetAside: (stand, e, { source }) => ({
			works: { ...stand.works, [source.id]: to("setAside", e) },
		}),
	},
}) {}

export const NightstandLive = Nightstand.toLayer(
	Effect.succeed(() => Effect.void)
);

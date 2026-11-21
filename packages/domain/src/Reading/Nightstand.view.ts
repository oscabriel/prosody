import * as Domain from "@alchemy.run/domain";
import { Effect, Schema } from "effect";

import { SHELF, ShelfName } from "../Library/Shelf.view.ts";
import { Session } from "../Session.middleware.ts";
import { Reading } from "./Reading.aggregate.ts";
import { Moment, Stage } from "./Stage.ts";

/** Where you are with one work, and when and on which device that last changed. */
export const Standing = Schema.Struct({ stage: Stage, ...Moment.fields });

export type Standing = typeof Standing.Type;

/** A work moving to `stage`, at the moment an event names. */
const to = (stage: Stage, { at, device }: Moment): Standing => ({
	stage,
	at,
	device,
});

/**
 * Every work you have begun, by work id. Those you are reading are the nightstand, newest first;
 * the rest are finished or set aside. There is one, beside the one shelf.
 */
export class Nightstand extends Domain.View("Nightstand", {
	from: [Reading],
	key: ShelfName,
	middleware: [Session],
	keyOf: { Reading: () => SHELF },
	state: Schema.Struct({ works: Schema.Record(Schema.String, Standing) }),
	initial: { works: {} },
	evolve: {
		// Reading on moves a work up the nightstand. One finished or set aside stays where it is.
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

/** Any of your devices may read the nightstand; the Session lets in no one else. */
export const NightstandLive = Nightstand.toLayer(
	Effect.succeed(() => Effect.void)
);

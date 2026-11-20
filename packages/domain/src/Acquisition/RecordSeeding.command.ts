import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { GrabId } from "./Grab.id.ts";

/** The payload has been seeded this many whole hours in all. */
export class PayloadSeeded extends Domain.Event("PayloadSeeded", {
	hours: Schema.Int,
}) {}

/** The press reports how long a payload has seeded. It records only more than before. */
export class RecordSeeding extends Domain.Command("RecordSeeding", {
	target: GrabId,
	input: { hours: Schema.Int },
	events: [PayloadSeeded],
}) {}

import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { GrabId } from "./Grab.id.ts";

export class PayloadSeeded extends Domain.Event("PayloadSeeded", {
	hours: Schema.Int,
}) {}

export class RecordSeeding extends Domain.Command("RecordSeeding", {
	target: GrabId,
	input: { hours: Schema.Int },
	events: [PayloadSeeded],
}) {}

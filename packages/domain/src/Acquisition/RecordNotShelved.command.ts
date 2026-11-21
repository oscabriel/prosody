import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { GrabId } from "./Grab.id.ts";

export class PayloadNotShelved extends Domain.Event("PayloadNotShelved", {
	reason: Schema.String,
}) {}

export class RecordNotShelved extends Domain.Command("RecordNotShelved", {
	target: GrabId,
	input: { reason: Schema.String },
	events: [PayloadNotShelved],
}) {}

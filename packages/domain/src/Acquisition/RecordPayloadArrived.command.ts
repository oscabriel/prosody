import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { GrabId } from "./Grab.id.ts";

export class PayloadArrived extends Domain.Event("PayloadArrived", {
	payload: Schema.String,
}) {}

export class RecordPayloadArrived extends Domain.Command(
	"RecordPayloadArrived",
	{
		target: GrabId,
		input: { payload: Schema.String },
		events: [PayloadArrived],
	}
) {}

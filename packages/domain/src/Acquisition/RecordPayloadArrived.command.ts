import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { GrabId } from "./Grab.id.ts";

/** The whole payload has come. `payload` is its file or folder, inside the downloads folder. */
export class PayloadArrived extends Domain.Event("PayloadArrived", {
	payload: Schema.String,
}) {}

/** The press reports a download finished. Recorded once, for a grab still downloading. */
export class RecordPayloadArrived extends Domain.Command(
	"RecordPayloadArrived",
	{
		target: GrabId,
		input: { payload: Schema.String },
		events: [PayloadArrived],
	}
) {}

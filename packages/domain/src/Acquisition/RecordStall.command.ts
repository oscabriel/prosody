import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { GrabId } from "./Grab.id.ts";

export class GrabStalled extends Domain.Event("GrabStalled", {
	reason: Schema.String,
}) {}

export class RecordStall extends Domain.Command("RecordStall", {
	target: GrabId,
	input: { reason: Schema.String },
	events: [GrabStalled],
}) {}

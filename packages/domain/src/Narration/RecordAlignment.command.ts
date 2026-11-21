import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";

export class NarrationAligned extends Domain.Event("NarrationAligned", {
	sentences: Schema.Int,
	matched: Schema.Int,
	checked: Schema.Int,
	heard: Schema.Int,
}) {}

export class RecordAlignment extends Domain.Command("RecordAlignment", {
	target: WorkId,
	input: {
		attempt: Schema.Int,
		sentences: Schema.Int,
		matched: Schema.Int,
		checked: Schema.Int,
		heard: Schema.Int,
	},
	events: [NarrationAligned],
}) {}

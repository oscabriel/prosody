import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Shelfmark } from "../Library/Shelfmark.ts";
import { WorkId } from "../Library/Work.id.ts";

export class EditionsPaired extends Domain.Event("EditionsPaired", {
	shelfmark: Shelfmark,
	text: Schema.String,
	audio: Schema.String,
}) {}

export class AlignmentStarted extends Domain.Event("AlignmentStarted", {
	attempt: Schema.Int,
}) {}

export class PairEditions extends Domain.Command("PairEditions", {
	target: WorkId,
	input: {
		shelfmark: Shelfmark,
		text: Schema.String,
		audio: Schema.String,
	},
	events: [EditionsPaired, AlignmentStarted],
}) {}

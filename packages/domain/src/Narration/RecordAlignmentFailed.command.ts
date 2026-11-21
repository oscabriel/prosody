import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";

export class AlignmentFailed extends Domain.Event("AlignmentFailed", {
	reason: Schema.String,
}) {}

export class RecordAlignmentFailed extends Domain.Command(
	"RecordAlignmentFailed",
	{
		target: WorkId,
		input: { attempt: Schema.Int, reason: Schema.String },
		events: [AlignmentFailed],
	}
) {}

import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";

/** The try ended without a reading copy, for this reason. */
export class AlignmentFailed extends Domain.Event("AlignmentFailed", {
	reason: Schema.String,
}) {}

/**
 * The press reports that it could not align the pair: an audio format it can't decode whole, or a
 * spot check that heard the wrong words. Like `RecordAlignment`, it never rejects.
 */
export class RecordAlignmentFailed extends Domain.Command(
	"RecordAlignmentFailed",
	{
		target: WorkId,
		input: { attempt: Schema.Int, reason: Schema.String },
		events: [AlignmentFailed],
	}
) {}

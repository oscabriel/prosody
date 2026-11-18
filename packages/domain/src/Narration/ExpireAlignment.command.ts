import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { AlignmentFailed } from "./RecordAlignmentFailed.command.ts";

/**
 * A try ran out of time. Scheduled by the Alignment policy when the try starts; it records nothing
 * if the press answered first.
 */
export class ExpireAlignment extends Domain.Command("ExpireAlignment", {
	target: WorkId,
	input: { attempt: Schema.Int },
	events: [AlignmentFailed],
}) {}

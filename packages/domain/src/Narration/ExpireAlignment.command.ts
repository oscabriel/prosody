import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { AlignmentFailed } from "./RecordAlignmentFailed.command.ts";

export class ExpireAlignment extends Domain.Command("ExpireAlignment", {
	target: WorkId,
	input: { attempt: Schema.Int },
	events: [AlignmentFailed],
}) {}

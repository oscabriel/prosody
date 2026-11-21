import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";

export class CopyFailed extends Domain.Event("CopyFailed", {
	reason: Schema.String,
}) {}

export class RecordCopyFailed extends Domain.Command("RecordCopyFailed", {
	target: WorkId,
	input: { attempt: Schema.Int, reason: Schema.String },
	events: [CopyFailed],
}) {}

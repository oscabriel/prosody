import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";

/** The try ended without a reading copy, for this reason. */
export class CopyFailed extends Domain.Event("CopyFailed", {
	reason: Schema.String,
}) {}

/** The press reports that it could not make the copy. Like `RecordCopy`, it never rejects. */
export class RecordCopyFailed extends Domain.Command("RecordCopyFailed", {
	target: WorkId,
	input: { attempt: Schema.Int, reason: Schema.String },
	events: [CopyFailed],
}) {}

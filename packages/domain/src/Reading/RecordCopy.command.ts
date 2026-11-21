import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";

export class CopyMade extends Domain.Event("CopyMade", {
	chapters: Schema.Int,
}) {}

export class RecordCopy extends Domain.Command("RecordCopy", {
	target: WorkId,
	input: { attempt: Schema.Int, chapters: Schema.Int },
	events: [CopyMade],
}) {}

import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";

export class SearchFailed extends Domain.Event("SearchFailed", {
	reason: Schema.String,
}) {}

export class RecordSearchFailed extends Domain.Command("RecordSearchFailed", {
	target: WorkId,
	input: { search: Schema.Int, reason: Schema.String },
	events: [SearchFailed],
}) {}

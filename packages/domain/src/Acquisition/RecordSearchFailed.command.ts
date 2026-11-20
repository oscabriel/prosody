import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";

/** The search ended without an answer, for this reason. `SearchAgain` tries once more. */
export class SearchFailed extends Domain.Event("SearchFailed", {
	reason: Schema.String,
}) {}

/**
 * The Indexer could not search: Prowlarr down, or refusing its key. Like `OfferReleases`, it records
 * nothing for a search that is no longer the latest.
 */
export class RecordSearchFailed extends Domain.Command("RecordSearchFailed", {
	target: WorkId,
	input: { search: Schema.Int, reason: Schema.String },
	events: [SearchFailed],
}) {}

import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Release } from "./Release.ts";

/** The Indexer could not search, for this reason. */
export class IndexerFailed extends Domain.Rejection("IndexerFailed", {
	reason: Schema.String,
}) {}

/**
 * Whatever searches the trackers for releases of a book. It holds the tracker accounts; the model
 * only asks it questions.
 */
export class Indexer extends Domain.ExternalSystem(
	"Indexer",
	{
		search: {
			args: { title: Schema.String, author: Schema.String },
			success: { releases: Schema.Array(Release) },
			error: IndexerFailed,
		},
	},
	{
		description:
			"Prowlarr, which searches the trackers and keeps their accounts.",
	}
) {}

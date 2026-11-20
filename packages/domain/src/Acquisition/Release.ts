import { Schema } from "effect";

import { EditionKind } from "../Library/ShelveEdition.command.ts";

/** One release of a book on a tracker, as the Indexer offers it: enough to choose it by. */
export const Release = Schema.Struct({
	/** The indexer's own name for it, which a grab will give back. */
	id: Schema.String,
	/** Which of the indexer's trackers has it. */
	indexer: Schema.String,
	title: Schema.String,
	kind: EditionKind,
	bytes: Schema.Finite,
	seeders: Schema.Int,
	/** When it was uploaded, as an ISO date. */
	published: Schema.String,
	/** Its page on the tracker, to look at before choosing it. */
	page: Schema.NullOr(Schema.String),
});

export type Release = typeof Release.Type;

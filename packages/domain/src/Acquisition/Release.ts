import { Effect, Schema } from "effect";

/** One release of a book on a tracker, as the Indexer offers it: enough to choose it by. */
export const Release = Schema.Struct({
	/** The indexer's own name for it, which a grab will give back. */
	id: Schema.String,
	/** Which of the indexer's trackers has it. */
	indexer: Schema.String,
	title: Schema.String,
	/** An ebook or an audiobook: what a tracker's categories say. */
	kind: Schema.Literals(["text", "audio"]),
	bytes: Schema.Finite,
	seeders: Schema.Int,
	/** When it was uploaded, as an ISO date. */
	published: Schema.String,
	/** Its page on the tracker, to look at before choosing it. */
	page: Schema.NullOr(Schema.String),
	/**
	 * Where the Indexer fetches its torrent, holding no key: a grab gives it back. A release offered
	 * before grabs has none.
	 */
	link: Schema.NullOr(Schema.String).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(null))
	),
});

export type Release = typeof Release.Type;

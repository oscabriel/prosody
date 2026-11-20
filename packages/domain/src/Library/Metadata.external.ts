import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Chapter } from "../Reading/Copy.ts";

/** An audiobook of a work, as Audnexus knows it from Audible. */
export const Recording = Schema.Struct({
	/** Audible's id for it. */
	asin: Schema.String,
	narrators: Schema.Array(Schema.String),
	minutes: Schema.Int,
	chapters: Schema.Array(Chapter),
});

export type Recording = typeof Recording.Type;

/** What the catalogues outside know of a work, beyond its title and author. */
export const Description = Schema.Struct({
	/** The year it was first published. */
	year: Schema.NullOr(Schema.Int),
	/** Its work on Open Library, such as `OL21745884W`. */
	openLibrary: Schema.NullOr(Schema.String),
	recording: Schema.NullOr(Recording),
});

export type Description = typeof Description.Type;

/**
 * Whatever knows about books in general. Asked about a title and author, it answers with them as it
 * spells them, or as they were asked when it knows no such work, and what else it knows.
 */
export class Metadata extends Domain.ExternalSystem(
	"Metadata",
	{
		describe: {
			args: { title: Schema.String, author: Schema.String },
			success: {
				title: Schema.String,
				author: Schema.String,
				description: Description,
			},
		},
	},
	{ description: "Open Library for a work, and Audnexus for its audiobook." }
) {}

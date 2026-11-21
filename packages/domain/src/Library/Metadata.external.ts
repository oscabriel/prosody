import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Chapter } from "../Reading/Copy.ts";

export const Recording = Schema.Struct({
	asin: Schema.String,
	narrators: Schema.Array(Schema.String),
	minutes: Schema.Int,
	chapters: Schema.Array(Chapter),
});

export type Recording = typeof Recording.Type;

export const Description = Schema.Struct({
	year: Schema.NullOr(Schema.Int),
	openLibrary: Schema.NullOr(Schema.String),
	recording: Schema.NullOr(Recording),
});

export type Description = typeof Description.Type;

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
	{
		description:
			"Open Library for a work, and Audible and Audnexus for its audiobook.",
	}
) {}

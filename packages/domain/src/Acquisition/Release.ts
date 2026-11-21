import { Effect, Schema } from "effect";

export const Release = Schema.Struct({
	id: Schema.String,
	indexer: Schema.String,
	title: Schema.String,
	kind: Schema.Literals(["text", "audio"]),
	bytes: Schema.Finite,
	seeders: Schema.Int,
	published: Schema.String,
	page: Schema.NullOr(Schema.String),
	link: Schema.NullOr(Schema.String).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(null))
	),
});

export type Release = typeof Release.Type;

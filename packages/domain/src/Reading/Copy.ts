import { Effect, Schema } from "effect";

import { Sentence } from "./Sentence.ts";

export const COVER = "cover.jpg";

export const Chapter = Schema.Struct({
	title: Schema.String,
	start: Schema.Finite,
	end: Schema.Finite,
});

export type Chapter = typeof Chapter.Type;

export const Heading = Schema.Struct({
	title: Schema.String,
	page: Schema.Int,
});

export type Heading = typeof Heading.Type;

export const Contents = Schema.Struct({
	audio: Schema.NullOr(Schema.String),
	sections: Schema.Array(
		Schema.Struct({ path: Schema.String, title: Schema.String })
	),
	chapters: Schema.Array(Chapter).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
	),
	cover: Schema.NullOr(Schema.String).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(null))
	),
	pictures: Schema.Array(Schema.String).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
	),
	headings: Schema.Array(Heading).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
	),
}).pipe(Schema.encodeKeys({ sections: "pages" }));

export type Contents = typeof Contents.Type;

export const Entry = Schema.Struct({
	sentence: Sentence,
	state: Schema.Literals(["aligned", "unaligned"]),
	start: Schema.optional(Schema.Finite),
	end: Schema.optional(Schema.Finite),
});

export type Entry = typeof Entry.Type;

export const Timeline = Schema.Array(Entry);

export type Timeline = typeof Timeline.Type;

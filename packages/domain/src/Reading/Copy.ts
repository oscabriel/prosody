import { Schema } from "effect";

import { Sentence } from "./Sentence.ts";

/**
 * What a reading copy holds, as the press writes it beside the copy in `contents.json`: the audio
 * file to play, and the pages that hold sentences, in reading order.
 */
export const Contents = Schema.Struct({
	audio: Schema.String,
	pages: Schema.Array(
		Schema.Struct({ path: Schema.String, title: Schema.String })
	),
});

export type Contents = typeof Contents.Type;

/** One sentence's place in the audio, in seconds, or none when it was not found there. */
export const Entry = Schema.Struct({
	sentence: Sentence,
	state: Schema.Literals(["aligned", "unaligned"]),
	start: Schema.optional(Schema.Finite),
	end: Schema.optional(Schema.Finite),
});

export type Entry = typeof Entry.Type;

/** Every sentence of a work in reading order: `timeline.json` beside its reading copy. */
export const Timeline = Schema.Array(Entry);

export type Timeline = typeof Timeline.Type;

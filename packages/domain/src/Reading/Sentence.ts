import { Effect, Schema } from "effect";

/**
 * A sentence of a work's text, as `<page path>#<span id>`. Text and audio both resolve to one, so
 * it is the only locator the reading room needs: a place is a sentence.
 */
export const Sentence = Schema.String.pipe(Schema.brand("Sentence"));

export type Sentence = typeof Sentence.Type;

/**
 * A place as a device sends it, and when. In a work with text it is a sentence. A work with its
 * audio alone has no sentences, so there it is a time in the audio instead.
 */
export const Position = Schema.Struct({
	sentence: Schema.NullOr(Sentence),
	/** Seconds into the audio, in a work with its audio alone. A place kept before there were times has none. */
	time: Schema.NullOr(Schema.Finite).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(null))
	),
	/** When the device kept it, in milliseconds since 1970. */
	at: Schema.Int,
});

export type Position = typeof Position.Type;

/** A place as it is kept: the sentence or the time, when, and which device. */
export const Bookmark = Schema.Struct({
	...Position.fields,
	device: Schema.String,
});

export type Bookmark = typeof Bookmark.Type;

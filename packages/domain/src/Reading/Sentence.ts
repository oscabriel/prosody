import { Schema } from "effect";

/**
 * A sentence of a work's text, as `<page path>#<span id>`. Text and audio both resolve to one, so
 * it is the only locator the reading room needs: a place is a sentence.
 */
export const Sentence = Schema.String.pipe(Schema.brand("Sentence"));

export type Sentence = typeof Sentence.Type;

/** A place as a device sends it: the sentence, and when. */
export const Position = Schema.Struct({
	sentence: Sentence,
	/** When the device kept it, in milliseconds since 1970. */
	at: Schema.Int,
});

export type Position = typeof Position.Type;

/** A place as it is kept: the sentence, when, and which device. */
export const Bookmark = Schema.Struct({
	...Position.fields,
	device: Schema.String,
});

export type Bookmark = typeof Bookmark.Type;

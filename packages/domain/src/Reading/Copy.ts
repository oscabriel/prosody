import { Effect, Schema } from "effect";

import { Sentence } from "./Sentence.ts";

/** A reading copy's cover, when the book has a picture: a JPEG beside its contents. */
export const COVER = "cover.jpg";

/** A chapter of a work's audio, from its start to its end in seconds. */
export const Chapter = Schema.Struct({
	title: Schema.String,
	start: Schema.Finite,
	end: Schema.Finite,
});

export type Chapter = typeof Chapter.Type;

/** A chapter of a book's pages: its title, and the page it begins on, counted from 1. */
export const Heading = Schema.Struct({
	title: Schema.String,
	page: Schema.Int,
});

export type Heading = typeof Heading.Type;

/**
 * What a reading copy holds, as the press writes it beside the copy in `contents.json`: the audio
 * file to play, the pages that hold sentences in reading order, the audio's chapters, and the cover
 * picture. A copy of the text alone has no audio; one of the audio alone has no pages, and lists its
 * chapters instead. A copy made of a book's pages has neither: it has a picture of each page, and
 * the chapters its PDF lists.
 */
export const Contents = Schema.Struct({
	audio: Schema.NullOr(Schema.String),
	pages: Schema.Array(
		Schema.Struct({ path: Schema.String, title: Schema.String })
	),
	// A copy made before there were copies of one edition has no chapters and no cover.
	chapters: Schema.Array(Chapter).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
	),
	cover: Schema.NullOr(Schema.String).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(null))
	),
	// Each page's picture in `pictures/`, in order. A copy made before there were copies of pages
	// has no pictures and no headings.
	pictures: Schema.Array(Schema.String).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
	),
	headings: Schema.Array(Heading).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
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

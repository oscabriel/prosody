import { strFromU8 } from "fflate";

import type { Book } from "./Epub.ts";
import { headingOf } from "./Sections.ts";
import { mark } from "./Sentences.ts";

/** A section a narrator reads, and what a reader would call it: what the book's contents call it, or its heading. */
export interface TitledSection {
	readonly path: string;
	readonly title: string;
}

/** A book's sections with every sentence marked. */
export interface MarkedSections {
	/** Each section a narrator reads, its sentences in spans of their own, by path. */
	readonly markups: ReadonlyMap<string, string>;
	/** The sections that hold sentences, in reading order. */
	readonly sections: ReadonlyArray<TitledSection>;
	/** Every sentence in reading order, as `<section path>#<span id>` and its text. */
	readonly sentences: ReadonlyArray<{
		readonly key: string;
		readonly text: string;
	}>;
}

/**
 * Mark every sentence in the sections a narrator reads, whether or not there is audio to find them in:
 * a place in the book is a sentence either way.
 */
export const markSections = (book: Book): MarkedSections => {
	const markups = new Map<string, string>();
	const sections: Array<TitledSection> = [];

	const sentences = book.sections
		.filter((section) => section.narrated)
		.flatMap((section) => {
			const marked = mark(
				strFromU8(book.files.get(section.path) ?? new Uint8Array()),
				"ps-"
			);

			markups.set(section.path, marked.markup);

			if (marked.sentences.length > 0) {
				sections.push({
					path: section.path,
					title: book.titles.get(section.path) ?? headingOf(marked.markup),
				});
			}

			return marked.sentences.map((sentence) => ({
				key: `${section.path}#${sentence.id}`,
				text: sentence.text,
			}));
		});

	return { markups, sections, sentences };
};

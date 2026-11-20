import { strFromU8 } from "fflate";

import type { Book } from "./Epub.ts";
import { headingOf } from "./Sections.ts";
import { mark } from "./Sentences.ts";

/** A page a narrator reads, and what a reader would call it: what the book's contents call it, or its heading. */
export interface Contents {
	readonly path: string;
	readonly title: string;
}

/** A book's pages with every sentence marked. */
export interface MarkedPages {
	/** Each page a narrator reads, its sentences in spans of their own, by path. */
	readonly markups: ReadonlyMap<string, string>;
	/** The pages that hold sentences, in reading order. */
	readonly pages: ReadonlyArray<Contents>;
	/** Every sentence in reading order, as `<page path>#<span id>` and its text. */
	readonly sentences: ReadonlyArray<{
		readonly key: string;
		readonly text: string;
	}>;
}

/**
 * Mark every sentence on the pages a narrator reads, whether or not there is audio to find them in:
 * a place in the book is a sentence either way.
 */
export const markPages = (book: Book): MarkedPages => {
	const markups = new Map<string, string>();
	const pages: Array<Contents> = [];

	const sentences = book.pages
		.filter((page) => page.narrated)
		.flatMap((page) => {
			const marked = mark(
				strFromU8(book.files.get(page.path) ?? new Uint8Array()),
				"ps-"
			);

			markups.set(page.path, marked.markup);

			if (marked.sentences.length > 0) {
				pages.push({
					path: page.path,
					title: book.titles.get(page.path) ?? headingOf(marked.markup),
				});
			}

			return marked.sentences.map((sentence) => ({
				key: `${page.path}#${sentence.id}`,
				text: sentence.text,
			}));
		});

	return { markups, pages, sentences };
};

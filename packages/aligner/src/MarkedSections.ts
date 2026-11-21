import { strFromU8 } from "fflate";

import type { Book } from "./Epub.ts";
import { headingOf } from "./Sections.ts";
import { mark } from "./Sentences.ts";

export interface TitledSection {
	readonly path: string;
	readonly title: string;
}

export interface MarkedSections {
	readonly markups: ReadonlyMap<string, string>;
	readonly sections: ReadonlyArray<TitledSection>;
	readonly sentences: ReadonlyArray<{
		readonly key: string;
		readonly text: string;
	}>;
}

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

import * as Markdown from "@foldkit/markdown";
import type { MarkdownDocument } from "@foldkit/markdown";
import { Schema } from "effect";

import { Frontmatter } from "./Frontmatter.ts";
import { docRouter, docsRouter, postRouter } from "./Route.ts";

interface Written {
	readonly default: unknown;
	readonly frontmatter: unknown;
}

export interface Page {
	readonly slug: string;
	readonly title: string;
	readonly summary: string;
	readonly order: number;
	readonly date: string;
	readonly document: MarkdownDocument;
}

export const FIRST = "index";

const about = Schema.decodeUnknownSync(Frontmatter);

const pagesOf = (written: Record<string, Written>): Array<Page> =>
	Object.entries(written).map(([path, file]) => {
		const { title, summary, order, date } = about(file.frontmatter);

		return {
			slug: path.slice(path.lastIndexOf("/") + 1, -".md".length),
			title,
			summary,
			order: order ?? 0,
			date: date ?? "",
			document: Markdown.decodeDocument(file.default),
		};
	});

export const DOCS = pagesOf(
	import.meta.glob<Written>("../content/docs/*.md", { eager: true })
).toSorted((a, b) => a.order - b.order);

export const POSTS = pagesOf(
	import.meta.glob<Written>("../content/blog/*.md", { eager: true })
).toSorted((a, b) => b.date.localeCompare(a.date));

export const docOf = (slug: string): Page | undefined =>
	DOCS.find((page) => page.slug === slug);

export const postOf = (slug: string): Page | undefined =>
	POSTS.find((page) => page.slug === slug);

export const docHref = (page: Page): string =>
	page.slug === FIRST ? docsRouter() : docRouter({ slug: page.slug });

export const postHref = (page: Page): string => postRouter({ slug: page.slug });

import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "@effect/vitest";
import { parseMarkdownWithFrontmatter } from "@foldkit/markdown/vite";
import { Option } from "effect";
import { fromString } from "foldkit/url";

import { Frontmatter } from "../src/Frontmatter.ts";
import { PASSAGE, sentenceAt } from "../src/Passage.ts";
import { AppRoute, urlToAppRoute } from "../src/Route.ts";

const CONTENT = `${import.meta.dirname}/../content`;

const written = (folder: string) =>
	readdirSync(`${CONTENT}/${folder}`).map((file) => ({
		slug: file.replace(/\.md$/u, ""),
		source: readFileSync(`${CONTENT}/${folder}/${file}`, "utf-8"),
	}));

const docs = written("docs");

const posts = written("blog");

const paths = new Set([
	"/",
	"/docs",
	"/blog",
	...docs.map(({ slug }) => `/docs/${slug}`),
	...posts.map(({ slug }) => `/blog/${slug}`),
]);

const linksIn = (source: string): Array<string> =>
	[...source.matchAll(/\]\((?<path>\/[^)#]*)/gu)].map(
		(match) => match.groups?.path ?? ""
	);

const routeOf = (path: string) =>
	Option.map(fromString(`https://prosody.example.com${path}`), urlToAppRoute);

describe("the site's pages", () => {
	it("each say what they are, in words the build accepts", () => {
		for (const { source } of [...docs, ...posts]) {
			const { maybeFrontmatter } = parseMarkdownWithFrontmatter(source, {
				frontmatter: Frontmatter,
			});

			expect(Option.isSome(maybeFrontmatter)).toBeTruthy();
		}
	});

	it("link only to pages that exist", () => {
		const broken = [...docs, ...posts].flatMap(({ slug, source }) =>
			linksIn(source)
				.filter((path) => !paths.has(path))
				.map((path) => `${slug}: ${path}`)
		);

		expect(broken).toStrictEqual([]);
	});

	it("are written without a dash for a pause", () => {
		const dashed = [...docs, ...posts].flatMap(({ slug, source }) =>
			source.includes("—") ? [slug] : []
		);

		expect(dashed).toStrictEqual([]);
	});
});

describe("the site's addresses", () => {
	it("are the docs, a page of them, the blog and a post", () => {
		expect(routeOf("/docs")).toStrictEqual(Option.some(AppRoute.Docs()));
		expect(routeOf("/docs/installing")).toStrictEqual(
			Option.some(AppRoute.Doc({ slug: "installing" }))
		);
		expect(routeOf("/blog/introducing-prosody")).toStrictEqual(
			Option.some(AppRoute.Post({ slug: "introducing-prosody" }))
		);
		expect(routeOf("/nowhere/at/all")).toStrictEqual(
			Option.some(AppRoute.NotFound({ path: "/nowhere/at/all" }))
		);
	});
});

describe("an address with a slash at its end", () => {
	it("is the same page as without it", () => {
		expect(routeOf("/blog/")).toStrictEqual(Option.some(AppRoute.Blog()));
		expect(routeOf("/")).toStrictEqual(Option.some(AppRoute.Home()));
	});
});

describe("the passage on the front page", () => {
	it("has no sentence before the first is spoken", () => {
		expect(sentenceAt(0)).toBeNull();
	});

	it("stays on a sentence through the quiet after it", () => {
		expect(sentenceAt(1.9)).toBe(0);
		expect(sentenceAt(2.3)).toBe(1);
	});

	it("is in the order it is spoken, with no sentence over another", () => {
		const overlaps = PASSAGE.filter(
			(spoken, index) => spoken.end > (PASSAGE[index + 1]?.start ?? Infinity)
		);

		expect(overlaps).toStrictEqual([]);
	});
});

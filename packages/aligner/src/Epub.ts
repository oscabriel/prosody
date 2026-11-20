import { isTag, isText } from "domhandler";
import type { AnyNode, Element } from "domhandler";
import { Schema } from "effect";
import { strFromU8, unzipSync } from "fflate";
import { parseDocument } from "htmlparser2";

import { isNarrated } from "./Sections.ts";

/** An EPUB opened in memory: its files by path, its package document, and its pages in order. */
export interface Book {
	readonly files: Map<string, Uint8Array>;
	/** The package document's path, e.g. `OEBPS/content.opf`. */
	readonly packagePath: string;
	readonly packageXml: string;
	/** The spine's pages, as paths in the archive. */
	readonly pages: ReadonlyArray<Page>;
	/** The cover picture's path in the archive, when the package names one. */
	readonly cover: string | undefined;
	/** What the book's own table of contents calls its pages, by path: the first entry for each. */
	readonly titles: ReadonlyMap<string, string>;
}

export interface Page {
	readonly path: string;
	/** The page's manifest id. */
	readonly id: string;
	/** Whether a narrator reads it: not a cover, an index, the copyright page and the like. */
	readonly narrated: boolean;
}

/** The EPUB could not be read. */
export class NotAnEpubError extends Schema.TaggedError<NotAnEpubError>()(
	"NotAnEpubError",
	{ message: Schema.String }
) {}

const elements = (nodes: ReadonlyArray<AnyNode>): Array<Element> =>
	nodes.flatMap((node) =>
		isTag(node) ? [node, ...elements(node.children)] : []
	);

/** A tag's name without its namespace prefix, lower case. */
const local = (element: Element) =>
	element.name.toLowerCase().replace(/^.*:/u, "");

/** The text inside an element, with its spaces run together. */
const textOf = (element: Element): string =>
	element.children
		.map((node) => {
			if (isText(node)) {
				return node.data;
			}

			return isTag(node) ? textOf(node) : "";
		})
		.join("")
		.replaceAll(/\s+/gu, " ")
		.trim();

/**
 * The titles an NCX table of contents gives the files it points into, by path. A file named more
 * than once keeps its first entry, which is the outermost: a chapter, not a section inside it.
 */
const titlesIn = (ncx: string, ncxPath: string): Map<string, string> => {
	const titles = new Map<string, string>();
	const all = elements(parseDocument(ncx, { xmlMode: true }).children);

	for (const point of all.filter((element) => local(element) === "navpoint")) {
		const parts = elements(point.children);

		const named = (name: string) =>
			parts.find((element) => local(element) === name);

		const label = named("text");
		const src = named("content")?.attribs.src;
		const path = src === undefined ? "" : resolve(ncxPath, src);

		if (label !== undefined && path !== "" && !titles.has(path)) {
			titles.set(path, textOf(label));
		}
	}

	return titles;
};

/** `href` resolved against the folder of `base`, as a path in the archive. */
export const resolve = (base: string, href: string): string => {
	const parts = base.split("/").slice(0, -1);

	for (const part of decodeURIComponent(href.split("#")[0] ?? "").split("/")) {
		if (part === "..") {
			parts.pop();
		} else if (part !== "." && part !== "") {
			parts.push(part);
		}
	}

	return parts.join("/");
};

/** `target` as a relative link from the file at `from`. */
export const relative = (from: string, target: string): string => {
	const a = from.split("/").slice(0, -1);
	const b = target.split("/");
	let common = 0;

	while (
		common < a.length &&
		common < b.length - 1 &&
		a[common] === b[common]
	) {
		common += 1;
	}

	return [
		...Array.from({ length: a.length - common }, () => ".."),
		...b.slice(common),
	]
		.map(encodeURIComponent)
		.join("/")
		.replaceAll("%2E%2E", "..");
};

const XHTML = new Set(["application/xhtml+xml", "text/html"]);

export const open = (bytes: Uint8Array): Book => {
	const files = new Map(Object.entries(unzipSync(bytes)));
	const container = files.get("META-INF/container.xml");

	if (!container) {
		throw new NotAnEpubError({ message: "it has no META-INF/container.xml" });
	}

	const rootfile = elements(
		parseDocument(strFromU8(container), { xmlMode: true }).children
	).find((element) => local(element) === "rootfile");

	const packagePath = rootfile?.attribs["full-path"] ?? "";
	const packageBytes = files.get(packagePath);

	if (packagePath === "" || packageBytes === undefined) {
		throw new NotAnEpubError({
			message: "its container names no package document",
		});
	}

	const packageXml = strFromU8(packageBytes);
	const all = elements(parseDocument(packageXml, { xmlMode: true }).children);

	const manifest = new Map(
		all
			.filter((element) => local(element) === "item")
			.map((item) => [item.attribs.id ?? "", item.attribs] as const)
	);

	const pages = all
		.filter((element) => local(element) === "itemref")
		.flatMap((ref) => {
			const item = manifest.get(ref.attribs.idref ?? "");

			const href = item?.href ?? "";

			return href !== "" && XHTML.has(item?.["media-type"] ?? "")
				? [{ path: resolve(packagePath, href), id: item?.id ?? "" }]
				: [];
		})
		.filter((page) => files.has(page.path));

	// An EPUB 2 package names its cover, index and the like in its guide.
	const guide = new Map(
		all
			.filter((element) => local(element) === "reference")
			.map(
				(reference) =>
					[
						resolve(packagePath, reference.attribs.href ?? ""),
						(reference.attribs.type ?? "").toLowerCase(),
					] as const
			)
	);

	// EPUB 3 marks the cover picture in the manifest; EPUB 2 names its id in a meta.
	const coverId = all.find(
		(element) =>
			local(element) === "meta" &&
			element.attribs.name?.toLowerCase() === "cover"
	)?.attribs.content;

	const coverItem =
		[...manifest.values()].find((item) =>
			(item.properties ?? "").split(/\s+/u).includes("cover-image")
		) ?? manifest.get(coverId ?? "");

	const cover =
		coverItem?.href === undefined ||
		!(coverItem["media-type"] ?? "").startsWith("image/")
			? undefined
			: resolve(packagePath, coverItem.href);

	// Most EPUBs, EPUB 3 ones too, carry an EPUB 2 table of contents, the NCX.
	const ncxHref = [...manifest.values()].find(
		(item) => item["media-type"] === "application/x-dtbncx+xml"
	)?.href;

	const ncxPath = ncxHref === undefined ? "" : resolve(packagePath, ncxHref);
	const ncx = files.get(ncxPath);

	return {
		files,
		packagePath,
		packageXml,
		cover: cover !== undefined && files.has(cover) ? cover : undefined,
		titles: ncx === undefined ? new Map() : titlesIn(strFromU8(ncx), ncxPath),
		pages: pages.map((page, index) => ({
			...page,
			narrated: isNarrated(
				page.path,
				strFromU8(files.get(page.path) ?? new Uint8Array()),
				index,
				pages.length,
				guide.get(page.path)
			),
		})),
	};
};

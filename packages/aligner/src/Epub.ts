import { isTag } from "domhandler";
import type { AnyNode, Element } from "domhandler";
import { strFromU8, unzipSync } from "fflate";
import { parseDocument } from "htmlparser2";

/** An EPUB opened in memory: its files by path, its package document, and its pages in order. */
export interface Book {
	readonly files: Map<string, Uint8Array>;
	/** The package document's path, e.g. `OEBPS/content.opf`. */
	readonly packagePath: string;
	readonly packageXml: string;
	/** The spine's pages, as paths in the archive. */
	readonly pages: ReadonlyArray<Page>;
}

export interface Page {
	readonly path: string;
	/** The page's manifest id. */
	readonly id: string;
}

/** The EPUB could not be read. */
export class NotAnEpub extends Error {
	override readonly name = "NotAnEpub";
}

const elements = (nodes: ReadonlyArray<AnyNode>): Array<Element> =>
	nodes.flatMap((node) =>
		isTag(node) ? [node, ...elements(node.children)] : []
	);

/** A tag's name without its namespace prefix, lower case. */
const local = (element: Element) =>
	element.name.toLowerCase().replace(/^.*:/u, "");

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
		throw new NotAnEpub("it has no META-INF/container.xml");
	}

	const rootfile = elements(
		parseDocument(strFromU8(container), { xmlMode: true }).children
	).find((element) => local(element) === "rootfile");

	const packagePath = rootfile?.attribs["full-path"];
	const packageBytes = packagePath ? files.get(packagePath) : undefined;

	if (!packagePath || !packageBytes) {
		throw new NotAnEpub("its container names no package document");
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

			return item?.href && XHTML.has(item["media-type"] ?? "")
				? [{ path: resolve(packagePath, item.href), id: item.id ?? "" }]
				: [];
		})
		.filter((page) => files.has(page.path));

	return { files, packagePath, packageXml, pages };
};

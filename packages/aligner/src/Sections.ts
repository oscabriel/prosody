/**
 * Which pages of a book a narrator reads. A cover, a title page, the contents, an index, a glossary,
 * a bibliography, the copyright page or the notes are never narrated; marking them would only count
 * sentences no one could ever find, and make every book look less in sync than it is.
 */

/** Kinds of page that are never read aloud, as EPUB 3 names them. */
const UNREAD = new Set([
	"cover",
	"titlepage",
	"halftitlepage",
	"toc",
	"toc-brief",
	"landmarks",
	"page-list",
	"loi",
	"lot",
	"index",
	"glossary",
	"bibliography",
	"copyright-page",
	"colophon",
	"contributors",
	"seriespage",
	"imprint",
	"errata",
	"other-credits",
	"footnotes",
	"endnotes",
	"rearnotes",
]);

/** The same kinds as an EPUB 2 package's guide names them. */
const UNREAD_IN_GUIDE = new Set([
	"cover",
	"title-page",
	"toc",
	"index",
	"glossary",
	"bibliography",
	"copyright-page",
	"colophon",
	"notes",
]);

/** Titles of pages that are never read aloud. */
const UNREAD_TITLE =
	/^\s*(?:index|glossary|bibliography|copyright|colophon|contents|table of contents|notes|endnotes)\s*$/iu;

/** File names of such pages, trusted only near the front or the back of the book. */
const UNREAD_FILE =
	/^(?:cover|title|titlepage|halftitle|copyright|toc|contents|index|ix\d*|glossary|colophon|bibliography|bib\d*|notes|endnotes)\b/iu;

/** The `epub:type` values on a page's body and its first section. */
const typesOf = (xhtml: string): Array<string> => {
	const body = xhtml.search(/<body\b/iu);

	if (body === -1) {
		return [];
	}

	// The body tag and the first element or two inside it.
	const head = xhtml.slice(body, body + 1500);

	const values = [...head.matchAll(/epub:type="(?<types>[^"]*)"/gu)].slice(
		0,
		3
	);

	return values.flatMap((match) => (match.groups?.types ?? "").split(/\s+/u));
};

/** A page's title, from its `<title>`. */
const titleOf = (xhtml: string): string =>
	/<title>(?<title>[^<]*)<\/title>/iu.exec(xhtml)?.groups?.title ?? "";

/**
 * Whether a narrator reads the page at `index` of `count` spine pages. `guideType` is what the EPUB 2
 * guide calls it, if anything.
 */
export const isNarrated = (
	path: string,
	xhtml: string,
	index: number,
	count: number,
	guideType: string | undefined
): boolean => {
	if (typesOf(xhtml).some((type) => UNREAD.has(type))) {
		return false;
	}

	if (guideType !== undefined && UNREAD_IN_GUIDE.has(guideType)) {
		return false;
	}

	if (UNREAD_TITLE.test(titleOf(xhtml))) {
		return false;
	}

	const nearAnEnd = index < count * 0.15 || index >= count * 0.85;
	const name = path.split("/").at(-1) ?? "";

	return !(nearAnEnd && UNREAD_FILE.test(name));
};

import { decodeHTML } from "entities";

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

const UNREAD_TITLE =
	/^\s*(?:index|glossary|bibliography|copyright|colophon|contents|table of contents|notes|endnotes)\s*$/iu;

const UNREAD_FILE =
	/^(?:cover|title|titlepage|halftitle|copyright|toc|contents|index|ix\d*|glossary|colophon|bibliography|bib\d*|notes|endnotes)\b/iu;

const typesOf = (xhtml: string): Array<string> => {
	const body = xhtml.search(/<body\b/iu);

	if (body === -1) {
		return [];
	}

	const head = xhtml.slice(body, body + 1500);

	const values = [...head.matchAll(/epub:type="(?<types>[^"]*)"/gu)].slice(
		0,
		3
	);

	return values.flatMap((match) => (match.groups?.types ?? "").split(/\s+/u));
};

const titleOf = (xhtml: string): string =>
	/<title>(?<title>[^<]*)<\/title>/iu.exec(xhtml)?.groups?.title ?? "";

const plain = (markup: string): string =>
	decodeHTML(
		markup
			.replaceAll(/<img\b[^>]*\balt="(?<alt>[^"]*)"[^>]*>/giu, " $<alt> ")
			.replaceAll(/<[^>]*>/gu, " ")
	)
		.replaceAll(/\s+/gu, " ")
		.trim();

export const headingOf = (xhtml: string): string => {
	const heading = /<h[1-3]\b[^>]*>(?<heading>[\s\S]*?)<\/h[1-3]>/iu.exec(xhtml)
		?.groups?.heading;

	const text = plain(heading ?? "");

	return text === "" ? plain(titleOf(xhtml)) : text;
};

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

import { render } from "dom-serializer";
import { Element, Text, isTag, isText } from "domhandler";
import type { AnyNode, ChildNode, ParentNode } from "domhandler";
import { decodeHTML } from "entities";
import { parseDocument } from "htmlparser2";

export interface Sentence {
	readonly id: string;
	readonly text: string;
}

export interface Marked {
	readonly markup: string;
	readonly sentences: ReadonlyArray<Sentence>;
}

const INLINE = new Set([
	"a",
	"abbr",
	"b",
	"bdi",
	"bdo",
	"big",
	"br",
	"cite",
	"code",
	"data",
	"del",
	"dfn",
	"em",
	"font",
	"i",
	"img",
	"ins",
	"kbd",
	"mark",
	"q",
	"s",
	"samp",
	"small",
	"span",
	"strike",
	"strong",
	"sub",
	"sup",
	"time",
	"tt",
	"u",
	"var",
	"wbr",
]);

const SKIP = new Set(["head", "script", "style", "svg", "math", "rt"]);

const NOT_AN_END =
	/\b(?:mr|mrs|ms|dr|prof|st|jr|sr|vs|mt|vol|fig|e\.g|i\.e)\.["'”’)\]]*\s*$/iu;

const INITIAL = /(?:^|\s)[A-HJ-Z]\.\s*$/u;

const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });

const FILLER = "\u2060";

const entitiesRead = (text: string): string =>
	text.replaceAll(/&(?:#\d+|#x[\da-f]+|[a-z][\da-z]*);/giu, (entity) => {
		const character = decodeHTML(entity);

		if (character === entity || character.length > entity.length) {
			return entity;
		}

		return character.trim() === ""
			? " ".repeat(entity.length)
			: character + FILLER.repeat(entity.length - character.length);
	});

export const sentenceRanges = (
	written: string
): Array<readonly [number, number]> => {
	const text = entitiesRead(written);
	const pieces: Array<[number, number]> = [];

	const unfilled = (from: number, to: number) =>
		text.slice(from, to).replaceAll(FILLER, "");

	for (const { index, segment } of segmenter.segment(text)) {
		const previous = pieces.at(-1);
		const lead = segment.replaceAll(FILLER, "").trimStart();
		const startsLower = /^["'“‘([]*[a-z]/u.test(lead);
		const hasLetters = /[\p{L}\p{N}]/u.test(segment);

		if (
			previous &&
			(startsLower ||
				!hasLetters ||
				NOT_AN_END.test(unfilled(previous[0], previous[1])) ||
				INITIAL.test(unfilled(previous[0], previous[1])))
		) {
			previous[1] = index + segment.length;
		} else {
			pieces.push([index, index + segment.length]);
		}
	}

	return pieces.flatMap(([from, to]) => {
		const slice = text.slice(from, to);
		const start = from + (slice.length - slice.trimStart().length);
		const end = to - (slice.length - slice.trimEnd().length);

		return end > start ? [[start, end] as const] : [];
	});
};

const isInline = (node: AnyNode): boolean =>
	isText(node) || (isTag(node) && INLINE.has(node.name.toLowerCase()));

const textOf = (node: AnyNode): string => {
	if (isText(node)) {
		return node.data;
	}

	if (isTag(node)) {
		if (SKIP.has(node.name)) {
			return "";
		}

		if (node.name === "br") {
			return " ";
		}

		return node.children.map(textOf).join("");
	}

	return "";
};

const isNoteReference = (node: Element): boolean =>
	node.attribs["epub:type"]?.includes("noteref") === true ||
	node.attribs.role === "doc-noteref" ||
	node.attribs["data-type"] === "noteref" ||
	(node.name === "sup" && /^\W*\d*\W*$/u.test(textOf(node)) && hasLink(node));

const hasLink = (node: Element): boolean =>
	node.children.some(
		(child) =>
			isTag(child) &&
			((child.name === "a" && "href" in child.attribs) || hasLink(child))
	);

const saidOf = (node: AnyNode): string => {
	if (!isTag(node)) {
		return textOf(node);
	}

	if (isNoteReference(node) || node.name === "br") {
		return " ";
	}

	if (SKIP.has(node.name)) {
		return "";
	}

	return node.children.map(saidOf).join("");
};

const blankedOf = (node: AnyNode): string => {
	if (!isTag(node)) {
		return textOf(node);
	}

	if (isNoteReference(node)) {
		return " ".repeat(textOf(node).length);
	}

	if (SKIP.has(node.name) || node.name === "br") {
		return textOf(node);
	}

	return node.children.map(blankedOf).join("");
};

const hasText = (nodes: ReadonlyArray<AnyNode>) =>
	nodes.some((node) => textOf(node).trim() !== "");

const slice = (
	nodes: ReadonlyArray<ChildNode>,
	from: number,
	to: number,
	last: boolean,
	state: { offset: number; placed: Set<AnyNode>; copied: Set<AnyNode> }
): Array<ChildNode> => {
	const out: Array<ChildNode> = [];

	for (const node of nodes) {
		const start = state.offset;
		const { length } = textOf(node);
		const end = start + length;

		if (length === 0 || (isTag(node) && node.name === "br")) {
			if (!state.placed.has(node) && start >= from && (start < to || last)) {
				state.placed.add(node);
				out.push(node);
			}

			state.offset = end;
			continue;
		}

		if (end <= from || start >= to) {
			state.offset = end;
			continue;
		}

		if (isText(node)) {
			out.push(
				new Text(
					node.data.slice(
						Math.max(0, from - start),
						Math.min(length, to - start)
					)
				)
			);
			state.offset = end;
			continue;
		}

		if (isTag(node)) {
			const attribs = { ...node.attribs };

			if (state.copied.has(node)) {
				delete attribs.id;
			}

			state.copied.add(node);

			const inner = { ...state, offset: start };
			const children = slice(node.children, from, to, last, inner);
			const copy = new Element(node.name, attribs, children);

			for (const child of children) {
				child.parent = copy;
			}

			out.push(copy);
		}

		state.offset = end;
	}

	return out;
};

const markRun = (
	parent: ParentNode,
	run: ReadonlyArray<ChildNode>,
	nextId: () => string,
	sentences: Array<Sentence>
) => {
	const text = run.map(textOf).join("");
	const ranges = sentenceRanges(run.map(blankedOf).join(""));

	if (ranges.length === 0) {
		return;
	}

	const state = {
		offset: 0,
		placed: new Set<AnyNode>(),
		copied: new Set<AnyNode>(),
	};

	const pieces: Array<ChildNode> = [];
	let at = 0;

	for (const [index, [from, to]] of ranges.entries()) {
		const isLast = index === ranges.length - 1;

		if (from > at) {
			pieces.push(...slice(run, at, from, false, { ...state, offset: 0 }));
		}

		const id = nextId();
		const children = slice(run, from, to, false, { ...state, offset: 0 });
		const span = new Element("span", { id }, children);

		for (const child of children) {
			child.parent = span;
		}

		pieces.push(span);
		sentences.push({
			id,
			text: decodeHTML(children.map(saidOf).join(""))
				.replaceAll(/\s+/gu, " ")
				.trim(),
		});
		at = to;

		if (isLast) {
			pieces.push(
				...slice(run, at, text.length, true, { ...state, offset: 0 })
			);
		}
	}

	const [first] = run;
	const index = first ? parent.children.indexOf(first) : -1;

	if (index === -1) {
		return;
	}

	parent.children.splice(index, run.length, ...pieces);

	for (const [i, piece] of pieces.entries()) {
		piece.parent = parent;
		piece.prev = pieces[i - 1] ?? parent.children[index - 1] ?? null;
		piece.next =
			pieces[i + 1] ?? parent.children[index + pieces.length] ?? null;
	}
};

const UNREAD_HEADING =
	/^\s*(?:references|footnotes|notes|endnotes|bibliography|further reading)\s*$/iu;

const NOTES = new Set([
	"footnote",
	"footnotes",
	"endnote",
	"endnotes",
	"rearnote",
	"rearnotes",
	"bibliography",
]);

const isNotes = (node: AnyNode): boolean =>
	isTag(node) &&
	(node.attribs["epub:type"] ?? "")
		.split(/\s+/u)
		.some((type) => NOTES.has(type));

const headingLevel = (node: AnyNode): number | undefined => {
	if (!isTag(node)) {
		return undefined;
	}

	const level = /^h(?<level>[1-6])$/iu.exec(node.name)?.groups?.level;

	return level === undefined ? undefined : Number(level);
};

const markIn = (
	node: ParentNode,
	nextId: () => string,
	sentences: Array<Sentence>
) => {
	let run: Array<ChildNode> = [];

	const flush = () => {
		if (hasText(run)) {
			markRun(node, run, nextId, sentences);
		}

		run = [];
	};

	const children = [...node.children];
	let skipBelow: number | undefined;

	for (const child of children) {
		const level = headingLevel(child);

		if (skipBelow !== undefined) {
			if (level === undefined || level > skipBelow) {
				continue;
			}

			skipBelow = undefined;
		}

		if (isInline(child)) {
			run.push(child);
			continue;
		}

		flush();

		if (level !== undefined && UNREAD_HEADING.test(textOf(child))) {
			skipBelow = level;
			continue;
		}

		if (
			isTag(child) &&
			!SKIP.has(child.name.toLowerCase()) &&
			!isNotes(child)
		) {
			markIn(child, nextId, sentences);
		}
	}

	flush();
};

export const mark = (xhtml: string, prefix: string): Marked => {
	const document = parseDocument(xhtml, {
		xmlMode: true,
		decodeEntities: false,
	});

	const sentences: Array<Sentence> = [];
	let count = 0;

	const nextId = () => {
		count += 1;

		return `${prefix}${count}`;
	};

	const find = (nodes: ReadonlyArray<AnyNode>): Element | undefined => {
		for (const node of nodes) {
			if (isTag(node)) {
				if (node.name.toLowerCase() === "body") {
					return node;
				}

				const found = find(node.children);

				if (found) {
					return found;
				}
			}
		}

		return undefined;
	};

	const body = find(document.children);

	if (body) {
		markIn(body, nextId, sentences);
	}

	return {
		markup: render(document, { xmlMode: true, decodeEntities: false }),
		sentences,
	};
};

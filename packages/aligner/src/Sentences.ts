import render from "dom-serializer";
import { Element, Text, isTag, isText } from "domhandler";
import type { AnyNode, ChildNode, ParentNode } from "domhandler";
import { decodeHTML } from "entities";
import { parseDocument } from "htmlparser2";

/** One sentence of a page: the id of the span that now holds it, and its text. */
export interface Sentence {
	readonly id: string;
	readonly text: string;
}

/** A page with every sentence wrapped in a span of its own. */
export interface Marked {
	readonly markup: string;
	readonly sentences: ReadonlyArray<Sentence>;
}

/** Elements that flow inside a line of text. Everything else starts a block. */
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

/** Elements whose text is never read aloud as the book's prose. */
const SKIP = new Set(["head", "script", "style", "svg", "math", "rt"]);

/** Abbreviations after which a full stop does not end a sentence. */
const NOT_AN_END =
	/\b(?:mr|mrs|ms|dr|prof|st|jr|sr|vs|mt|vol|fig|e\.g|i\.e)\.["'”’)\]]*\s*$/iu;

/** An initial, as in "J. R. R. Tolkien". "I." ends a sentence. */
const INITIAL = /(?:^|\s)[A-HJ-Z]\.\s*$/u;

const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });

/**
 * A block's text split into sentences, as ranges of it. The segmenter alone ends a sentence after
 * "Dr." and inside "“Why?” she asked.", so a piece after an abbreviation or before a lower case
 * word joins its neighbour.
 */
export const sentenceRanges = (
	text: string
): Array<readonly [number, number]> => {
	const pieces: Array<[number, number]> = [];

	for (const { index, segment } of segmenter.segment(text)) {
		const previous = pieces.at(-1);
		const lead = segment.trimStart();
		const startsLower = /^["'“‘([]*[a-z]/u.test(lead);
		const hasLetters = /[\p{L}\p{N}]/u.test(segment);

		if (
			previous &&
			(startsLower ||
				!hasLetters ||
				NOT_AN_END.test(text.slice(previous[0], previous[1])) ||
				INITIAL.test(text.slice(previous[0], previous[1])))
		) {
			previous[1] = index + segment.length;
		} else {
			pieces.push([index, index + segment.length]);
		}
	}

	// Trim the spaces at each end, and drop a piece that is only spaces.
	return pieces.flatMap(([from, to]) => {
		const slice = text.slice(from, to);
		const start = from + (slice.length - slice.trimStart().length);
		const end = to - (slice.length - slice.trimEnd().length);

		return end > start ? [[start, end] as const] : [];
	});
};

const isInline = (node: AnyNode): boolean =>
	isText(node) || (isTag(node) && INLINE.has(node.name.toLowerCase()));

/** The text a node holds, as it flows: a line break counts as a space. */
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

/** A link to a note: the narrator does not read its marker. */
const isNoteReference = (node: Element): boolean =>
	node.attribs["epub:type"]?.includes("noteref") === true ||
	(node.name === "sup" && /^\W*\d*\W*$/u.test(textOf(node)) && hasLink(node));

const hasLink = (node: Element): boolean =>
	node.children.some(
		(child) =>
			isTag(child) &&
			((child.name === "a" && "href" in child.attribs) || hasLink(child))
	);

/** The text a narrator reads from a node: its text without note markers. */
const saidOf = (node: AnyNode): string =>
	isTag(node) && isNoteReference(node)
		? " "
		: isTag(node)
			? node.name === "br"
				? " "
				: SKIP.has(node.name)
					? ""
					: node.children.map(saidOf).join("")
			: textOf(node);

/** A node's text with note markers turned to spaces, keeping every offset. */
const blankedOf = (node: AnyNode): string =>
	isTag(node) && isNoteReference(node)
		? " ".repeat(textOf(node).length)
		: isTag(node) && !SKIP.has(node.name) && node.name !== "br"
			? node.children.map(blankedOf).join("")
			: textOf(node);

const hasText = (nodes: ReadonlyArray<AnyNode>) =>
	nodes.some((node) => textOf(node).trim() !== "");

/**
 * The part of `nodes` that holds text from `from` to `to`, copied. An element split between two
 * sentences is copied into both, and keeps its id only in the first. An element with no text (an
 * image, an empty anchor) goes in the first range that reaches its place.
 */
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

/** Wrap each sentence of one run of inline nodes in a span, in place of the run. */
const markRun = (
	parent: ParentNode,
	run: ReadonlyArray<ChildNode>,
	nextId: () => string,
	sentences: Array<Sentence>
) => {
	const text = run.map(textOf).join("");
	// Split with note markers blanked out, the same length, so "cold.1 Then" ends at "cold.".
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

	const first = run[0];
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

/** Mark every block under `node`: a run of inline content is a block of its own. */
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

	// A copy, since marking a run replaces it in the children.
	for (const child of [...node.children]) {
		if (isInline(child)) {
			run.push(child);
			continue;
		}

		flush();

		if (isTag(child) && !SKIP.has(child.name.toLowerCase())) {
			markIn(child, nextId, sentences);
		}
	}

	flush();
};

/**
 * Wrap every sentence of a page in `<span id="...">`. Ids are `<prefix><n>`, so the prefix should be
 * one the page does not use.
 */
export const mark = (xhtml: string, prefix: string): Marked => {
	// Entities stay as written, so the page comes back out byte for byte apart from the spans.
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

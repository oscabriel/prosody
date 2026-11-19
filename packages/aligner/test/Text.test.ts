import { describe, expect, it } from "@effect/vitest";

import { headingOf, isNarrated } from "../src/Sections.ts";
import { mark, sentenceRanges } from "../src/Sentences.ts";
import {
	cardinal,
	ordinal,
	phraseStarts,
	phrases,
	spoken,
	year,
} from "../src/Spoken.ts";

const page = (body: string) =>
	`<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>T</title></head><body>${body}</body></html>`;

describe("sentences", () => {
	it("does not end a sentence after a title or an initial", () => {
		const text = "Dr. Smith met J. R. Hartley. They talked.";

		expect(
			sentenceRanges(text).map(([a, b]) => text.slice(a, b))
		).toStrictEqual(["Dr. Smith met J. R. Hartley.", "They talked."]);
	});

	it("keeps a quotation with the words that say who spoke", () => {
		const text = "“Why?” she asked. He shrugged.";

		expect(
			sentenceRanges(text).map(([a, b]) => text.slice(a, b))
		).toStrictEqual(["“Why?” she asked.", "He shrugged."]);
	});

	it("reads a quote written as an entity as the quote it is", () => {
		const marked = mark(
			page(
				"<p>He left.&#8221; She stayed.&#160;&#8220;Why?&#8221; he asked Dr.&#160;No.</p>"
			),
			"s"
		);

		expect(marked.sentences.map((sentence) => sentence.text)).toStrictEqual([
			"He left.”",
			"She stayed.",
			"“Why?” he asked Dr. No.",
		]);
		expect(marked.markup).toContain(
			'<span id="s1">He left.&#8221;</span> <span id="s2">She stayed.</span>&#160;<span id="s3">&#8220;Why?&#8221; he asked Dr.&#160;No.</span>'
		);
	});

	it("wraps each sentence in a span, splitting inline markup between them", () => {
		const { markup, sentences } = mark(
			page('<p>Then <em id="e">he left. She</em> stayed.</p>'),
			"s"
		);

		expect(markup).toContain(
			'<p><span id="s1">Then <em id="e">he left.</em></span><em> </em><span id="s2"><em>She</em> stayed.</span></p>'
		);
		expect(sentences).toStrictEqual([
			{ id: "s1", text: "Then he left." },
			{ id: "s2", text: "She stayed." },
		]);
	});

	it("marks blocks in the order they appear, and leaves entities as written", () => {
		const { markup, sentences } = mark(
			page("<div>Before. <p>Inside &amp; out.</p> After.</div>"),
			"s"
		);

		expect(sentences.map((s) => s.text)).toStrictEqual([
			"Before.",
			"Inside & out.",
			"After.",
		]);
		expect(markup).toContain("Inside &amp; out.");
	});

	it("knows a note's marker by the names O'Reilly and accessible books give it", () => {
		const marked = mark(
			page(
				'<p>Engineers shied away [<a data-type="noteref" href="#x">18</a>]. It held<a role="doc-noteref" href="#y">2</a>.</p>'
			),
			"s"
		);

		expect(marked.sentences.map((sentence) => sentence.text)).toStrictEqual([
			"Engineers shied away [ ].",
			"It held .",
		]);
	});

	it("leaves a note's marker out of what is said", () => {
		const { sentences } = mark(
			page('<p>It was cold.<sup><a href="#n1">1</a></sup> Then it snowed.</p>'),
			"s"
		);

		expect(sentences.map((s) => s.text)).toStrictEqual([
			"It was cold.",
			"Then it snowed.",
		]);
	});
});

describe("the spoken form", () => {
	it("says numbers as a narrator would", () => {
		expect(cardinal(1234)).toStrictEqual([
			"one",
			"thousand",
			"two",
			"hundred",
			"thirty",
			"four",
		]);
		expect(ordinal(21)).toStrictEqual(["twenty", "first"]);
		expect(year(1984)).toStrictEqual(["nineteen", "eighty", "four"]);
		expect(year(2005)).toStrictEqual(["two", "thousand", "five"]);
		expect(year(1905)).toStrictEqual(["nineteen", "oh", "five"]);
	});

	it("expands abbreviations, symbols and money, and drops what is not said", () => {
		expect(
			spoken(
				"Mr. O’Brien paid $5,000 (about 3.5% more) at 2:23 in the 1990s—café & all."
			)
		).toStrictEqual([
			"mister",
			"o'brien",
			"paid",
			"five",
			"thousand",
			"dollars",
			"about",
			"three",
			"point",
			"five",
			"percent",
			"more",
			"at",
			"two",
			"twenty",
			"three",
			"in",
			"the",
			"nineteen",
			"nineties",
			"cafe",
			"and",
			"all",
		]);
	});

	it("says only letters, whatever marks a token holds", () => {
		// The model has no token for a colon or a comma: left in, they become its unknown token.
		expect(spoken("state:default and a,b")).toStrictEqual([
			"state",
			"default",
			"and",
			"a",
			"b",
		]);
		expect(spoken("$1,234.50 in the '90s, a 3:2 ratio")).toStrictEqual([
			..."one thousand two hundred thirty four point five zero dollars".split(
				" "
			),
			..."in the nineties a three two ratio".split(" "),
		]);
	});

	it("parts quoted speech from the narration around it", () => {
		const parts = phrases("“No,” he said, “not at 2:23.”");

		expect(parts).toStrictEqual([
			["no"],
			["he", "said"],
			["not", "at", "two", "twenty", "three"],
		]);
		expect(phraseStarts(parts)).toStrictEqual([1, 3]);
		expect(phrases("Plain narration, with a comma.")).toHaveLength(1);
	});
});

describe("what is narrated", () => {
	it("skips a section headed References, up to the next heading as high", () => {
		const { sentences } = mark(
			page(
				"<h2>Summary</h2><p>All done.</p><h5>References</h5><ol><li>Kleppmann, M. 2017.</li></ol><h2>Next</h2><p>Onward.</p>"
			),
			"s"
		);

		expect(sentences.map((s) => s.text)).toStrictEqual([
			"Summary",
			"All done.",
			"Next",
			"Onward.",
		]);
	});

	it("knows a copyright page or an index from a chapter", () => {
		expect(
			isNarrated(
				"OEBPS/c.xhtml",
				page('<section epub:type="copyright-page"><p>©</p></section>'),
				1,
				20,
				undefined
			)
		).toBeFalsy();
		expect(
			isNarrated("OEBPS/ix01.html", page("<p>A</p>"), 19, 20, undefined)
		).toBeFalsy();
		expect(
			isNarrated("OEBPS/ix01.html", page("<p>A</p>"), 10, 20, undefined)
		).toBeTruthy();
		expect(
			isNarrated("OEBPS/c.xhtml", page("<p>A</p>"), 1, 20, "copyright-page")
		).toBeFalsy();
		expect(
			isNarrated(
				"OEBPS/ch01.xhtml",
				page('<section epub:type="chapter"><p>It began.</p></section>'),
				3,
				20,
				undefined
			)
		).toBeTruthy();
	});

	it("names a page by its first heading, or else its title", () => {
		expect(
			headingOf(
				page(
					'<h2 class="ch">Chapter 1<br/><em>Loomings</em></h2><p>Call me Ishmael.</p>'
				)
			)
		).toBe("Chapter 1 Loomings");
		expect(headingOf(page("<p>No heading here.</p>"))).toBe("T");
		expect(
			headingOf(
				page('<h1><img alt="Chapter 1" src="c1.jpg"/></h1><p>Two plus two?</p>')
			)
		).toBe("Chapter 1");
	});
});

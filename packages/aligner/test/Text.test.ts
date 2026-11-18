import { describe, expect, it } from "@effect/vitest";

import { mark, sentenceRanges } from "../src/Sentences.ts";
import { cardinal, ordinal, spoken, year } from "../src/Spoken.ts";

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
});

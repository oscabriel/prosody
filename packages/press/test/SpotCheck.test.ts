import { describe, expect, it } from "@effect/vitest";

import {
	likeness,
	matchedIn,
	sentenceIn,
	spread,
	wordsOf,
} from "../src/SpotCheck.ts";

/** Two sentences of an overlay as Storyteller's aligner writes it, on one line. */
const overlay =
	'<seq id="c1_overlay" epub:textref="../Text/part0004.xhtml" epub:type="chapter">' +
	'<par id="c1-s1" epub:type="storyteller:matched"><text src="../Text/part0004.xhtml#c1-s1"/>' +
	'<audio src="../Audio/Carl.m4b" clipBegin="18.900s" clipEnd="25.840s"/></par>' +
	'<par id="c1-s2" epub:type="storyteller:unmatched"><text src="../Text/part0004.xhtml#c1-s2"/>' +
	'<audio src="../Audio/Carl.m4b" clipBegin="25.840s" clipEnd="26.100s"/></par></seq>';

const page =
	'<p><span id="c1-s1" epub:type="storyteller:sentence-span"><span class="first-phrase">The transformation occurred</span> at approximately 2:23 AM. </span>' +
	'<span id="c1-s2" epub:type="storyteller:sentence-span">Nobody saw it coming.</span></p>';

describe("the spot check", () => {
	it("reads only the matched sentences of an overlay", () => {
		expect(matchedIn(overlay)).toStrictEqual([
			{ id: "c1-s1", page: "../Text/part0004.xhtml", begin: 18.9, end: 25.84 },
		]);
	});

	it("finds a sentence's text, without its markup", () => {
		expect(sentenceIn(page, "c1-s1")).toBe(
			"The transformation occurred at approximately 2:23 AM."
		);
		expect(sentenceIn(page, "c9-s9")).toBe("");
	});

	it("hears a sentence right when most of its words are there, in order", () => {
		const said = wordsOf(
			"The transformation occurred at approximately 2:23 AM."
		);

		expect(likeness(said, said)).toBe(1);
		expect(
			likeness(
				said,
				wordsOf("the transformation occurred at approximately two twenty three")
			)
		).toBeGreaterThan(0.6);
		expect(
			likeness(said, wordsOf("I'm Carl, and this is my cat"))
		).toBeLessThan(0.2);
	});

	it("spreads its picks through the whole book", () => {
		expect(spread([1, 2, 3, 4, 5, 6, 7, 8], 4)).toStrictEqual([1, 3, 5, 7]);
		expect(spread([1, 2], 4)).toStrictEqual([1, 2]);
	});
});

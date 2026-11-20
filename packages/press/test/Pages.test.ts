import { describe, expect, it } from "@effect/vitest";

import { headingsOf } from "../src/Pages.ts";

/** The start of `pdftohtml -xml`'s answer for Domain-Driven Design, cut short. */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<pdf2xml producer="poppler" version="26.10.0">
<page number="1" position="absolute" top="0" left="0" height="1188" width="892">
</page>
<outline>
<item page="2">Crunching Knowledge</item>
<outline>
<item page="6">Ingredients of Effective Modeling</item>
<item page="7">Knowledge Crunching</item>
</outline>
<item page="12">Communication &amp; the Use of Language</item>
<item page="25">Binding Model and Implementation</item>
</outline>
</pdf2xml>`;

describe("a PDF's headings", () => {
	it("are the chapters at the top of its outline, with their pages", () => {
		expect(headingsOf(XML)).toStrictEqual([
			{ title: "Crunching Knowledge", page: 2 },
			{ title: "Communication & the Use of Language", page: 12 },
			{ title: "Binding Model and Implementation", page: 25 },
		]);
	});

	it("read a quoted title as it is printed", () => {
		const quoted = `<outline>
<item page="80">The &#34;Big Ball of Mud&#34; isn't &lt;Layered&gt;</item>
</outline>`;

		expect(headingsOf(quoted)).toStrictEqual([
			{ title: 'The "Big Ball of Mud" isn\'t <Layered>', page: 80 },
		]);
	});

	it("are none when it has no outline", () => {
		expect(headingsOf('<pdf2xml producer="poppler"></pdf2xml>')).toStrictEqual(
			[]
		);
	});
});

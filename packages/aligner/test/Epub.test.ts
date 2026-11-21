import { describe, expect, it } from "@effect/vitest";
import { strToU8, zipSync } from "fflate";

import { open } from "../src/Epub.ts";

/** An EPUB of one section whose package holds `metadata` and `items` beside the section's own. */
const epub = (metadata: string, items: string) =>
	zipSync({
		"META-INF/container.xml": strToU8(
			'<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'
		),
		"OEBPS/content.opf": strToU8(
			`<package><metadata>${metadata}</metadata><manifest><item id="p1" href="p1.xhtml" media-type="application/xhtml+xml"/>${items}</manifest><spine><itemref idref="p1"/></spine></package>`
		),
		"OEBPS/p1.xhtml": strToU8("<html><body><p>Hello.</p></body></html>"),
		"OEBPS/images/front.jpg": new Uint8Array([1, 2, 3]),
	});

describe("an EPUB's cover", () => {
	it("is the picture EPUB 3 marks as the cover", () => {
		const book = open(
			epub(
				"",
				'<item id="c" href="images/front.jpg" media-type="image/jpeg" properties="cover-image"/>'
			)
		);

		expect(book.cover).toBe("OEBPS/images/front.jpg");
	});

	it("is the picture an EPUB 2 meta names", () => {
		const book = open(
			epub(
				'<meta name="cover" content="c"/>',
				'<item id="c" href="images/front.jpg" media-type="image/jpeg"/>'
			)
		);

		expect(book.cover).toBe("OEBPS/images/front.jpg");
	});

	it("is none when the named item is a section, not a picture", () => {
		const book = open(epub('<meta name="cover" content="p1"/>', ""));

		expect(book.cover).toBeUndefined();
	});

	it("is none when the archive does not hold it", () => {
		const book = open(
			epub(
				"",
				'<item id="c" href="images/back.jpg" media-type="image/jpeg" properties="cover-image"/>'
			)
		);

		expect(book.cover).toBeUndefined();
	});
});

describe("an EPUB's table of contents", () => {
	it("names each section by its first entry in the NCX", () => {
		const book = open(
			zipSync({
				"META-INF/container.xml": strToU8(
					'<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'
				),
				"OEBPS/content.opf": strToU8(
					'<package><manifest><item id="p1" href="Text/p1.xhtml" media-type="application/xhtml+xml"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine><itemref idref="p1"/></spine></package>'
				),
				"OEBPS/toc.ncx": strToU8(
					'<ncx><navMap><navPoint><navLabel><text>Book 1:\n The Boy</text></navLabel><content src="Text/p1.xhtml"/><navPoint><navLabel><text>A part of it</text></navLabel><content src="Text/p1.xhtml#s2"/></navPoint></navPoint></navMap></ncx>'
				),
				"OEBPS/Text/p1.xhtml": strToU8(
					"<html><body><p>Sing.</p></body></html>"
				),
			})
		);

		expect([...book.titles]).toStrictEqual([
			["OEBPS/Text/p1.xhtml", "Book 1: The Boy"],
		]);
	});
});

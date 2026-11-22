import { describe, expect, it } from "@effect/vitest";

import { completes, recordingOf } from "../src/OpenLibraryMetadata.ts";

describe("a name Open Library gives", () => {
	it("is taken when it has every word you gave", () => {
		expect(completes("weir", "Andy Weir")).toBeTruthy();
		expect(completes("project hail mary", "Project Hail Mary")).toBeTruthy();
		expect(
			completes("Alice in Wonderland", "Alice's Adventures in Wonderland")
		).toBeTruthy();
		expect(completes("naive", "Naïve")).toBeTruthy();
		expect(completes("Garcia Marquez", "Gabriel García Márquez")).toBeTruthy();
	});

	it("is not taken when it would replace what you gave", () => {
		expect(completes("Homer", "Ὅμηρος")).toBeFalsy();
		expect(
			completes("The Odyssey", "The Martian / Artemis / Project Hail Mary")
		).toBeFalsy();
	});
});

describe("an audiobook from Audnexus", () => {
	it("has its narrators, its length in minutes, and its chapters in seconds", () => {
		expect(
			recordingOf(
				{
					asin: "B08G9PRS1K",
					narrators: [{ name: "Ray Porter" }],
					runtimeLengthMin: 970,
				},
				{
					chapters: [
						{ title: "Opening Credits", startOffsetMs: 0, lengthMs: 11_264 },
						{ title: "Chapter 1", startOffsetMs: 17_173, lengthMs: 2_203_838 },
					],
				}
			)
		).toStrictEqual({
			asin: "B08G9PRS1K",
			narrators: ["Ray Porter"],
			minutes: 970,
			chapters: [
				{ title: "Opening Credits", start: 0, end: 11.264 },
				{ title: "Chapter 1", start: 17.173, end: 2221.011 },
			],
		});
	});
});

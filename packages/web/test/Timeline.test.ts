import { describe, expect, it } from "@effect/vitest";
import type { Timeline } from "@prosody/domain/Reading/Copy";
import { Sentence } from "@prosody/domain/Reading/Sentence";

import {
	chapterAt,
	heardOf,
	leftInSection,
	sentenceAt,
	startOf,
} from "../src/Timeline.ts";

const at = (span: string) => Sentence.make(`OEBPS/ch1.xhtml#${span}`);

const timeline: Timeline = [
	{ sentence: at("ps-1"), state: "aligned", start: 10, end: 12 },
	{ sentence: at("ps-2"), state: "unaligned" },
	{ sentence: at("ps-3"), state: "aligned", start: 13, end: 15.5 },
];

describe("the timeline", () => {
	it("knows the sentence being read, and keeps it through a pause", () => {
		const heard = heardOf(timeline);

		expect(sentenceAt(heard, 9)).toBeUndefined();
		expect(sentenceAt(heard, 11)).toStrictEqual(at("ps-1"));
		expect(sentenceAt(heard, 12.5)).toStrictEqual(at("ps-1"));
		expect(sentenceAt(heard, 14)).toStrictEqual(at("ps-3"));
	});

	it("plays text nobody read from the next sentence that was read", () => {
		expect(startOf(timeline, at("ps-1"))).toBe(10);
		expect(startOf(timeline, at("ps-2"))).toBe(13);
		expect(startOf(timeline, at("ps-9"))).toBeUndefined();
	});

	it("knows how much audio a section has left", () => {
		expect(leftInSection(heardOf(timeline), "OEBPS/ch1.xhtml", 14)).toBe(1.5);
		expect(leftInSection(heardOf(timeline), "OEBPS/ch2.xhtml", 14)).toBe(0);
	});
});

describe("the chapters of audio alone", () => {
	const chapters = [
		{ title: "Down the Rabbit-Hole", start: 0, end: 640.6 },
		{ title: "The Pool of Tears", start: 640.6, end: 1376.4 },
	];

	it("know the one playing, from its first moment", () => {
		expect(chapterAt(chapters, 0)).toBe(0);
		expect(chapterAt(chapters, 640.5)).toBe(0);
		expect(chapterAt(chapters, 640.6)).toBe(1);
		expect(chapterAt(chapters, 9999)).toBe(1);
	});
});

import { describe, expect, it } from "@effect/vitest";
import type { Timeline } from "@prosody/domain/Reading/Copy";
import { Sentence } from "@prosody/domain/Reading/Sentence";

import {
	bookDuration,
	chapterAt,
	heardOf,
	lengthOf,
	sectionBounds,
	sectionDuration,
	sentenceAt,
	startOf,
	timeIn,
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

const inSection = (path: string, span: string) =>
	Sentence.make(`${path}#${span}`);

describe("the sections of a pair, as the audio has them", () => {
	const book: Timeline = [
		{ sentence: inSection("title.xhtml", "ps-1"), state: "unaligned" },
		{
			sentence: inSection("ch1.xhtml", "ps-1"),
			state: "aligned",
			start: 10,
			end: 14,
		},
		{ sentence: inSection("ch1.xhtml", "ps-2"), state: "unaligned" },
		{
			sentence: inSection("ch1.xhtml", "ps-3"),
			state: "aligned",
			start: 14.5,
			end: 20,
		},
		{
			sentence: inSection("ch2.xhtml", "ps-1"),
			state: "aligned",
			start: 25,
			end: 30,
		},
		{
			sentence: inSection("ch2.xhtml", "ps-2"),
			state: "aligned",
			start: 30,
			end: 41.5,
		},
	];

	const heard = heardOf(book);

	it("begin at their first sentence heard and end at their last", () => {
		expect(sectionBounds(heard, "ch1.xhtml")).toStrictEqual({
			start: 10,
			end: 20,
		});
		expect(sectionBounds(heard, "ch2.xhtml")).toStrictEqual({
			start: 25,
			end: 41.5,
		});
	});

	it("have no bounds and no length where nothing was heard", () => {
		expect(sectionBounds(heard, "title.xhtml")).toBeUndefined();
		expect(sectionDuration(heard, "title.xhtml")).toBe(0);
		expect(sectionDuration(heard, "ch1.xhtml")).toBe(10);
		expect(sectionDuration(heard, "ch2.xhtml")).toBe(16.5);
	});

	it("end the book where the last sentence heard ends", () => {
		expect(bookDuration(heard)).toBe(41.5);
		expect(bookDuration(heardOf([]))).toBe(0);
	});
});

describe("a time within a chapter", () => {
	const chapter = { start: 640.6, end: 1376.4 };

	it("counts from the chapter's start, and never leaves the chapter", () => {
		expect(timeIn(chapter, 700.6)).toBe(60);
		expect(timeIn(chapter, 100)).toBe(0);
		expect(timeIn(chapter, 5000)).toBe(lengthOf(chapter));
	});
});

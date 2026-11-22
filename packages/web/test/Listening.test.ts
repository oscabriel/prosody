import { describe, expect, it } from "@effect/vitest";
import type { Timeline } from "@prosody/domain/Reading/Copy";
import { Sentence } from "@prosody/domain/Reading/Sentence";
import { Option } from "effect";

import { clockOf, heardBeside, hearingOf, leftOf } from "../src/Listening.ts";
import { Book } from "../src/Model.ts";
import { rateLabel, rateOf } from "../src/RoomUpdate.ts";
import { roomOf } from "../src/Steps.ts";

describe("a length of audio", () => {
	it("reads as a clock does", () => {
		expect(clockOf(0)).toBe("0:00");
		expect(clockOf(65.9)).toBe("1:05");
		expect(clockOf(3729)).toBe("1:02:09");
	});

	it("says what is left in minutes, then hours", () => {
		expect(leftOf(10)).toBe("1m left");
		expect(leftOf(845)).toBe("14m left");
		expect(leftOf(3600)).toBe("1h left");
		expect(leftOf(6120)).toBe("1h 42m left");
	});
});

describe("a speed", () => {
	it("stays between the slowest and the fastest, in steps of a twentieth", () => {
		expect(rateOf(0.1)).toBe(0.75);
		expect(rateOf(9)).toBe(2.5);
		expect(rateOf(1.1)).toBe(1.1);
		expect(rateOf(1.26)).toBe(1.25);
	});

	it("is written without needless noughts", () => {
		expect(rateLabel(1)).toBe("1×");
		expect(rateLabel(1.25)).toBe("1.25×");
	});
});

const alice = {
	audio: "alice.m4b",
	sections: [],
	chapters: [
		{ title: "Down the Rabbit-Hole", start: 0, end: 640 },
		{ title: "The Pool of Tears", start: 640, end: 1376 },
	],
	cover: null,
	pictures: [],
	headings: [],
};

describe("what a room with audio alone is hearing", () => {
	const room = {
		...roomOf("w-alice", false),
		book: Book.Open({ contents: alice, timeline: [] }),
		time: 700,
	};

	it("counts within the chapter, and to the end of the book", () => {
		const hearing = hearingOf(room, alice, []);

		expect(hearing.title).toBe("The Pool of Tears");
		expect(hearing.within).toBe(60);
		expect(hearing).toHaveLength(736);
		expect(hearing.leftInChapter).toBe(676);
		expect(hearing.leftInBook).toBe(676);
	});

	it("leaves sooner at a faster speed", () => {
		const hearing = hearingOf({ ...room, rate: 2 }, alice, []);

		expect(hearing.leftInChapter).toBe(338);
	});

	it("shows where the scrubber is while it is held, in the same chapter", () => {
		const hearing = hearingOf(
			{ ...room, scrubbingTime: Option.some(1000) },
			alice,
			[]
		);

		expect(hearing.chapter).toBe(1);
		expect(hearing.within).toBe(360);
	});

	it("knows the chapters either side", () => {
		expect(heardBeside(alice, [], 1, -1)).toBe(0);
		expect(heardBeside(alice, [], 1, 1)).toBeUndefined();
	});
});

const inSection = (path: string, span: string) =>
	Sentence.make(`${path}#${span}`);

const carl = {
	audio: "carl.m4b",
	sections: [
		{ path: "title.xhtml", title: "Title" },
		{ path: "ch1.xhtml", title: "Chapter 1" },
		{ path: "part.xhtml", title: "Part I" },
		{ path: "ch2.xhtml", title: "Chapter 2" },
	],
	chapters: [],
	cover: null,
	pictures: [],
	headings: [],
};

const carlTimeline: Timeline = [
	{ sentence: inSection("title.xhtml", "ps-1"), state: "unaligned" },
	{
		sentence: inSection("ch1.xhtml", "ps-1"),
		state: "aligned",
		start: 10,
		end: 14,
	},
	{
		sentence: inSection("ch1.xhtml", "ps-2"),
		state: "aligned",
		start: 14.5,
		end: 20,
	},
	{ sentence: inSection("part.xhtml", "ps-1"), state: "unaligned" },
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
		end: 40,
	},
];

describe("what a paired room is hearing", () => {
	const room = {
		...roomOf("w-carl", false),
		book: Book.Open({ contents: carl, timeline: carlTimeline }),
		sentence: Option.some(inSection("ch1.xhtml", "ps-2")),
		time: 16,
	};

	it("counts within the section being spoken", () => {
		const hearing = hearingOf(room, carl, carlTimeline);

		expect(hearing.title).toBe("Chapter 1");
		expect(hearing.within).toBe(6);
		expect(hearing).toHaveLength(10);
		expect(hearing.leftInChapter).toBe(4);
		expect(hearing.leftInBook).toBe(24);
	});

	it("has no length in a section nobody read aloud", () => {
		const hearing = hearingOf(
			{ ...room, sentence: Option.some(inSection("title.xhtml", "ps-1")) },
			carl,
			carlTimeline
		);

		expect(hearing).toHaveLength(0);
		expect(hearing.within).toBe(0);
	});

	it("steps over sections nobody read aloud", () => {
		expect(heardBeside(carl, carlTimeline, 1, 1)).toBe(3);
		expect(heardBeside(carl, carlTimeline, 3, -1)).toBe(1);
		expect(heardBeside(carl, carlTimeline, 1, -1)).toBeUndefined();
		expect(heardBeside(carl, carlTimeline, 3, 1)).toBeUndefined();
	});
});

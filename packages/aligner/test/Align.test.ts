import { describe, expect, it } from "@effect/vitest";

import { align } from "../src/Align.ts";
import { wrongLength } from "../src/Aligner.ts";
import { steadyTies, tiesOf } from "../src/Anchors.ts";
import { clipsOf } from "../src/Boundaries.ts";
import { decode, encode, transcriptOf } from "../src/Emissions.ts";
import type { Emissions } from "../src/Emissions.ts";
import { relative, resolve } from "../src/Epub.ts";
import { COSTS, forceAlign } from "../src/ForcedAlign.ts";
import { clock } from "../src/Overlay.ts";
import { likeness, spread, wordsOf } from "../src/SpotCheck.ts";

/**
 * Emissions in which each frame clearly hears one token, or silence (-1). Every frame keeps two
 * tokens: the one heard and a runner-up.
 */
const heard = (
	frames: ReadonlyArray<number>,
	vocabulary: ReadonlyArray<string>
): Emissions => {
	const kept = 2;
	const ids = new Uint16Array(frames.length * kept);
	const scores = new Float32Array(frames.length * kept);
	const blank = new Float32Array(frames.length);

	for (const [t, token] of frames.entries()) {
		const sure = token === -1 ? 0 : token;
		ids[t * kept] = sure;
		ids[t * kept + 1] = (sure + 1) % vocabulary.length;
		scores[t * kept] = token === -1 ? -6 : -0.05;
		scores[t * kept + 1] = -7;
		blank[t] = token === -1 ? -0.05 : -4;
	}

	return {
		frames: frames.length,
		secondsPerFrame: 0.08,
		kept,
		ids,
		scores,
		blank,
		loudness: new Float32Array([-60, -20, -20, -60]),
		secondsPerLoudness: 0.01,
		tracks: [frames.length * 0.08],
		vocabulary,
	};
};

/** Loudness every 10 ms: speech where `speech` says so, and a studio's silence elsewhere. */
const sounding = (speech: (centiseconds: number) => boolean): Emissions => ({
	...heard(
		Array.from({ length: 40 }, () => -1),
		["▁a", "▁b"]
	),
	loudness: Float32Array.from({ length: 320 }, (_, at) =>
		speech(at) ? -20 : -90
	),
});

describe("forced alignment", () => {
	// Silence, A B, a pause, C D, four frames of speech the text lacks, E, silence.
	const audio = heard(
		[-1, -1, -1, 0, 0, 1, -1, -1, 2, 3, 5, 5, 5, 5, 4, -1, -1],
		["▁a", "▁b", "▁c", "▁d", "▁e", "▁f", "▁g", "▁h", "▁x", "▁y"]
	);

	it("places what was read, absorbs what the text lacks, and skips what was not read", () => {
		const placed = forceAlign(audio, 0, audio.frames, [
			{ tokens: [0, 1] },
			{ tokens: [8, 9] },
			{ tokens: [2, 3] },
			{ tokens: [4] },
		]);

		expect(placed.map((p) => (p ? [p.from, p.to] : undefined))).toStrictEqual([
			[3, 5],
			undefined,
			[8, 9],
			[14, 14],
		]);
	});

	it("does not believe a unit it could only force onto audio that does not hold it", () => {
		// A B, silence, C. X was not read, but one frame of silence is cheaper for it than skipping.
		const short = heard([0, 1, -1, -1, 2], ["▁a", "▁b", "▁c", "▁x"]);
		const units = [{ tokens: [0, 1] }, { tokens: [3] }, { tokens: [2] }];

		const frames = (costs = COSTS) =>
			forceAlign(short, 0, short.frames, units, costs).map((p) =>
				p ? [p.from, p.to] : undefined
			);

		expect(frames({ ...COSTS, leastScore: -Infinity })[1]).toBeDefined();
		expect(frames()).toStrictEqual([[0, 1], undefined, [4, 4]]);
	});

	it("places the speech of a sentence whose narration was left out", () => {
		// "No," he said softly. Then go. A dramatised reading says "No" and "Then go".
		const dramatised = heard(
			[-1, 0, -1, -1, 3, 4, -1],
			["▁no", "▁he", "▁said", "▁then", "▁go", "▁softly"]
		);

		const then = { words: ["then", "go"], tokens: [[3], [4]] };

		const no = {
			words: ["no", "he", "said", "softly"],
			tokens: [[0], [1], [2], [5]],
		};

		expect(align(dramatised, [no, then])[0]).toBeUndefined();
		expect(align(dramatised, [{ ...no, phrases: [1] }, then])).toMatchObject([
			{ from: 1, to: 1 },
			{ from: 4, to: 5 },
		]);
	});

	it("reads the model's own transcript as words with their frames", () => {
		expect(transcriptOf(audio).map((w) => w.word)).toStrictEqual([
			"a",
			"b",
			"c",
			"d",
			"f",
			"e",
		]);
	});

	it("keeps emissions whole through a file", () => {
		const back = decode(encode(audio));

		expect(back.frames).toBe(audio.frames);
		expect([...back.ids]).toStrictEqual([...audio.ids]);
		expect([...back.blank]).toStrictEqual([...audio.blank]);
		expect(back.vocabulary).toStrictEqual(audio.vocabulary);
	});
});

describe("boundaries", () => {
	it("runs an end on across a stop's closure to the last sound of the word", () => {
		// Sound to 0.50 s, 30 ms of closure, sound to 0.70 s, then a pause.
		const audio = sounding((at) => at < 50 || (at >= 53 && at < 70));
		const [clip] = clipsOf(audio, [{ from: 2, to: 5, score: 0 }]);

		expect(clip?.end).toBeCloseTo(0.7, 5);
	});

	it("gives sound between two sentences to one of them, at its quietest", () => {
		// Speech runs on from 0.10 s to 1.50 s, dipping at 0.55 s.
		const audio = sounding((at) => at >= 10 && at < 150);
		audio.loudness[55] = -35;

		const [first, second] = clipsOf(audio, [
			{ from: 2, to: 5, score: 0 },
			{ from: 9, to: 15, score: 0 },
		]);

		expect(first?.end).toBeCloseTo(0.55, 5);
		expect(second?.start).toBeCloseTo(0.55, 5);
	});
});

describe("anchors", () => {
	const book =
		"the cat sat on the mat and then the dog came in and sat by the fire".split(
			" "
		);

	it("ties runs of words found once in each, in order", () => {
		const said = ["intro", ...book.slice(0, 8), "extra", ...book.slice(8)];

		expect(tiesOf(book, said, 4).slice(0, 2)).toStrictEqual([
			{ word: 0, heard: 1 },
			{ word: 1, heard: 2 },
		]);
	});

	it("drops a tie with no neighbour that agrees with it", () => {
		const ties = [
			{ word: 0, heard: 0 },
			{ word: 1, heard: 1 },
			{ word: 500, heard: 900 },
			{ word: 800, heard: 801 },
			{ word: 801, heard: 802 },
		];

		expect(steadyTies(ties)).toStrictEqual([
			{ word: 0, heard: 0 },
			{ word: 1, heard: 1 },
			{ word: 800, heard: 801 },
			{ word: 801, heard: 802 },
		]);
	});
});

describe("the reading copy", () => {
	it("resolves and relates paths inside the archive", () => {
		expect(resolve("OEBPS/content.opf", "Text/part%200001.xhtml#x")).toBe(
			"OEBPS/Text/part 0001.xhtml"
		);
		expect(relative("OEBPS/MediaOverlays/a.smil", "OEBPS/Text/a.xhtml")).toBe(
			"../Text/a.xhtml"
		);
		expect(
			relative("OEBPS/MediaOverlays/a.smil", "OEBPS/Audio/My Book.m4b")
		).toBe("../Audio/My%20Book.m4b");
	});

	it("writes durations as EPUB wants them", () => {
		expect(clock(48_693.87)).toBe("13:31:33.870");
	});
});

describe("the audio's length", () => {
	it("tells audio that decoded short from audio that decoded whole", () => {
		// Spike 1: the first 1,200 s of an xHE-AAC file decoded to 908 s, with no error.
		expect(wrongLength([908], [1200])).toBe(0);
		expect(wrongLength([48_693.87025], [48_693.870295])).toBeUndefined();
		expect(wrongLength([100, 200], [100, 0])).toBeUndefined();
		expect(wrongLength([100], [100, 200])).toBe(1);
	});
});

describe("the spot check", () => {
	it("hears a sentence right when most of its words are there, in order", () => {
		const said = wordsOf(
			"The transformation occurred at approximately 2:23 AM."
		);

		expect(likeness(said, said)).toBe(1);
		expect(
			likeness(said, wordsOf("I'm Carl, and this is my cat"))
		).toBeLessThan(0.2);
	});

	it("spreads its picks through the whole book", () => {
		expect(spread([1, 2, 3, 4, 5, 6, 7, 8], 4)).toStrictEqual([1, 3, 5, 7]);
		expect(spread([1, 2], 4)).toStrictEqual([1, 2]);
	});
});

import { steadyTies, tiesOf } from "./Anchors.ts";
import type { Tie } from "./Anchors.ts";
import type { Emissions, Heard } from "./Emissions.ts";
import { transcriptOf } from "./Emissions.ts";
import { forceAlign } from "./ForcedAlign.ts";
import type { Placed, Unit } from "./ForcedAlign.ts";

/** A sentence as the alignment sees it: its spoken words, and each word's tokens. */
export interface Said {
	readonly words: ReadonlyArray<string>;
	readonly tokens: ReadonlyArray<ReadonlyArray<number>>;
}

/** Ties come from runs of this many words, and stretches between them are at least this long. */
const GRAM = 5;

const STRETCH = 25;

/** Inside a stretch too big to align at once, shorter runs tie it down further. */
const SMALL_GRAM = 3;

const SMALL_STRETCH = 8;

/** Frames times states: more than this, and a stretch is cut smaller or left unaligned. */
const MOST_CELLS = 60_000_000;

interface Cut {
	readonly word: number;
	readonly frame: number;
}

/** A unit of one sentence's words, whose tokens grow as its words are gathered. */
interface Gathered extends Unit {
	readonly sentence: number;
	readonly tokens: Array<number>;
}

/** Call `between` on each point and the one after it, in order. */
const eachStretch = (
	points: ReadonlyArray<Cut>,
	between: (a: Cut, b: Cut) => void
) => {
	for (let i = 1; i < points.length; i += 1) {
		const a = points[i - 1];
		const b = points[i];

		if (a !== undefined && b !== undefined) {
			between(a, b);
		}
	}
};

/** Ties at least `stretch` book words apart, with the heard frames strictly rising. */
const cutsOf = (
	ties: ReadonlyArray<Tie>,
	heard: ReadonlyArray<Heard>,
	stretch: number,
	wordOffset: number,
	heardOffset: number
): Array<Cut> => {
	const cuts: Array<Cut> = [];

	for (const tie of ties) {
		const word = tie.word + wordOffset;
		const frame = heard[tie.heard + heardOffset]?.from ?? 0;
		const last = cuts.at(-1);

		if (!last || (word - last.word >= stretch && frame - last.frame >= 2)) {
			cuts.push({ word, frame });
		}
	}

	return cuts;
};

/**
 * Where each sentence is in the audio, in frames, or `undefined` for a sentence nobody read.
 */
export const align = (
	emissions: Emissions,
	sentences: ReadonlyArray<Said>
): Array<Placed | undefined> => {
	const words: Array<string> = [];
	const sentenceOf: Array<number> = [];
	const tokensOf: Array<ReadonlyArray<number>> = [];

	for (const [index, sentence] of sentences.entries()) {
		for (const [w, word] of sentence.words.entries()) {
			words.push(word);
			sentenceOf.push(index);
			tokensOf.push(sentence.tokens[w] ?? []);
		}
	}

	const heard = transcriptOf(emissions);

	const ties = steadyTies(
		tiesOf(
			words,
			heard.map((h) => h.word),
			GRAM
		)
	);

	const cuts = cutsOf(ties, heard, STRETCH, 0, 0);
	const placed = Array.from<Placed | undefined>({ length: sentences.length });

	/** Align words `[fromWord, toWord)` in frames `[fromFrame, toFrame)`, merging into `placed`. */
	const stretch = (
		fromWord: number,
		toWord: number,
		fromFrame: number,
		toFrame: number,
		depth: number
	) => {
		if (toWord <= fromWord || toFrame <= fromFrame) {
			return;
		}

		const units: Array<Gathered> = [];

		for (let w = fromWord; w < toWord; w += 1) {
			const sentence = sentenceOf[w] ?? 0;
			const last = units.at(-1);
			const tokens = tokensOf[w] ?? [];

			if (last && last.sentence === sentence) {
				last.tokens.push(...tokens);
			} else {
				units.push({ sentence, tokens: [...tokens] });
			}
		}

		const states = units.reduce((n, unit) => n + 2 * unit.tokens.length + 2, 1);

		if (states * (toFrame - fromFrame) > MOST_CELLS) {
			if (depth > 0) {
				return;
			}

			// Tie the stretch down with shorter runs, heard only within its frames.
			const within = (h: Heard) => h.from >= fromFrame && h.from < toFrame;
			const inside = heard.filter(within);
			const firstHeard = heard.findIndex(within);

			const smaller = steadyTies(
				tiesOf(
					words.slice(fromWord, toWord),
					inside.map((h) => h.word),
					SMALL_GRAM
				),
				20,
				3
			);

			const inner = cutsOf(smaller, heard, SMALL_STRETCH, fromWord, firstHeard);

			const points = [
				{ word: fromWord, frame: fromFrame },
				...inner.map((cut) => ({ word: cut.word, frame: cut.frame - 1 })),
				{ word: toWord, frame: toFrame },
			];

			eachStretch(points, (a, b) => {
				stretch(a.word, b.word, a.frame, b.frame, depth + 1);
			});

			return;
		}

		const result = forceAlign(emissions, fromFrame, toFrame, units);

		for (const [index, unit] of units.entries()) {
			const here = result[index];
			const before = placed[unit.sentence];

			if (here) {
				placed[unit.sentence] = before
					? {
							from: Math.min(before.from, here.from),
							to: Math.max(before.to, here.to),
							score: Math.min(before.score, here.score),
						}
					: here;
			}
		}
	};

	const points = [
		{ word: 0, frame: 0 },
		...cuts.map((cut) => ({
			word: cut.word,
			frame: Math.max(0, cut.frame - 1),
		})),
		{ word: words.length, frame: emissions.frames },
	];

	eachStretch(points, (a, b) => {
		stretch(a.word, b.word, a.frame, b.frame, 0);
	});

	return placed;
};

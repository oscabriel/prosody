import {
	candidatesOf,
	longestChain,
	steadyTies,
	straysOf,
	tiesOf,
} from "./Anchors.ts";
import type { Tie } from "./Anchors.ts";
import type { Emissions, Heard } from "./Emissions.ts";
import { transcriptOf } from "./Emissions.ts";
import { COSTS, forceAlign } from "./ForcedAlign.ts";
import type { Costs, Placed, Unit } from "./ForcedAlign.ts";

/** A sentence as the alignment sees it: its spoken words, and each word's tokens. */
export interface Said {
	readonly words: ReadonlyArray<string>;
	readonly tokens: ReadonlyArray<ReadonlyArray<number>>;
	/**
	 * The index of each word that starts a phrase after the first. A narrator may leave a phrase out
	 * (a dramatised reading drops "he said"), so each is placed or skipped on its own.
	 */
	readonly phrases?: ReadonlyArray<number>;
}

/** Ties come from runs of this many words, and stretches between them are at least this long. */
const GRAM = 5;

const STRETCH = 25;

/** Inside a stretch too big to align at once, shorter runs tie it down further. */
const SMALL_GRAM = 3;

const SMALL_STRETCH = 8;

/** Runs out of order inside runs out of order are followed this deep. */
const DEEPEST = 6;

/** Frames times states: more than this, and a stretch is cut smaller or left unaligned. */
const MOST_CELLS = 60_000_000;

interface Cut {
	readonly word: number;
	readonly frame: number;
}

/** A unit of one phrase's words, whose tokens grow as its words are gathered. */
interface Gathered extends Unit {
	readonly sentence: number;
	readonly phrase: number;
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
	sentences: ReadonlyArray<Said>,
	costs: Costs = COSTS
): Array<Placed | undefined> => {
	const words: Array<string> = [];
	const sentenceOf: Array<number> = [];
	const phraseOf: Array<number> = [];
	const tokensOf: Array<ReadonlyArray<number>> = [];
	let phrase = 0;

	for (const [index, sentence] of sentences.entries()) {
		const starts = new Set(sentence.phrases);
		phrase += 1;

		for (const [w, word] of sentence.words.entries()) {
			phrase += starts.has(w) ? 1 : 0;
			words.push(word);
			sentenceOf.push(index);
			phraseOf.push(phrase);
			tokensOf.push(sentence.tokens[w] ?? []);
		}
	}

	const heard = transcriptOf(emissions);

	const candidates = candidatesOf(
		words,
		heard.map((h) => h.word),
		GRAM
	);

	/** Align words `[fromWord, toWord)` in frames `[fromFrame, toFrame)`, merging into `placed`. */
	const stretch = (
		placed: Array<Placed | undefined>,
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
			const last = units.at(-1);
			const tokens = tokensOf[w] ?? [];

			if (last && last.phrase === phraseOf[w]) {
				last.tokens.push(...tokens);
			} else {
				units.push({
					sentence: sentenceOf[w] ?? 0,
					phrase: phraseOf[w] ?? 0,
					tokens: [...tokens],
				});
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
				stretch(placed, a.word, b.word, a.frame, b.frame, depth + 1);
			});

			return;
		}

		const result = forceAlign(emissions, fromFrame, toFrame, units, costs);

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

	/** Align a run of words in a run of frames, cut at the ties that fall inside both. */
	const region = (
		within: ReadonlyArray<Tie>,
		from: Cut,
		to: Cut
	): Array<Placed | undefined> => {
		const placed = Array.from<Placed | undefined>({ length: sentences.length });

		const cuts = cutsOf(within, heard, STRETCH, 0, 0)
			.map((cut) => ({ word: cut.word, frame: cut.frame - 1 }))
			.filter(
				(cut) =>
					cut.word > from.word &&
					cut.word < to.word &&
					cut.frame > from.frame &&
					cut.frame < to.frame
			);

		eachStretch([from, ...cuts, to], (a, b) => {
			stretch(placed, a.word, b.word, a.frame, b.frame, 0);
		});

		return placed;
	};

	const frameOf = (tie: Tie | undefined, otherwise: number) =>
		tie === undefined ? otherwise : (heard[tie.heard]?.from ?? otherwise);

	/** The first word of a sentence at or after `word`, or `limit` when there is none before it. */
	const sentenceFrom = (word: number, limit: number): number => {
		let at = word;

		while (at > 0 && at < limit && sentenceOf[at] === sentenceOf[at - 1]) {
			at += 1;
		}

		return at;
	};

	/** The first word of the sentence that holds `word`. */
	const sentenceAt = (word: number, limit: number): number => {
		let at = word;

		while (
			at < words.length &&
			at > limit &&
			sentenceOf[at] === sentenceOf[at - 1]
		) {
			at -= 1;
		}

		return at;
	};

	/**
	 * Align the words from `from` to `to` in the frames from `from` to `to`, tied down by the
	 * longest chain of `within`. Text heard out of the book's order shows as runs of candidates
	 * out of step with that chain: each run is aligned where it was heard, from the first whole
	 * sentence of its gap in the text to the last, and replaces what the gap had found.
	 */
	const place = (
		within: ReadonlyArray<Tie>,
		from: Cut,
		to: Cut,
		depth: number
	): Array<Placed | undefined> => {
		const chain = steadyTies(longestChain(within));
		const placed = region(chain, from, to);

		for (const stray of depth < DEEPEST ? straysOf(within, chain) : []) {
			// The tie before the gap holds GRAM words in place, and the sentences they are in.
			const fromWord = sentenceFrom(
				Math.max(
					from.word,
					stray.wordsAfter === undefined ? 0 : stray.wordsAfter.word + GRAM
				),
				to.word
			);

			const toWord = sentenceAt(
				Math.min(to.word, stray.wordsBefore?.word ?? words.length),
				fromWord
			);

			const moved = place(
				stray.candidates,
				{
					word: fromWord,
					frame: Math.max(from.frame, frameOf(stray.heardAfter, 0)),
				},
				{
					word: toWord,
					frame: Math.min(
						to.frame,
						frameOf(stray.heardBefore, emissions.frames)
					),
				},
				depth + 1
			);

			for (const [index, found] of moved.entries()) {
				placed[index] = found ?? placed[index];
			}
		}

		return placed;
	};

	return place(
		candidates,
		{ word: 0, frame: 0 },
		{ word: words.length, frame: emissions.frames },
		0
	);
};

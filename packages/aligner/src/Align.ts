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

export interface Said {
	readonly words: ReadonlyArray<string>;
	readonly tokens: ReadonlyArray<ReadonlyArray<number>>;
	readonly phrases?: ReadonlyArray<number>;
}

const GRAM = 5;

const STRETCH = 25;

const SMALL_GRAM = 3;

const SMALL_STRETCH = 8;

const DEEPEST = 6;

const MOST_CELLS = 60_000_000;

interface Cut {
	readonly word: number;
	readonly frame: number;
}

interface Gathered extends Unit {
	readonly sentence: number;
	readonly phrase: number;
	readonly tokens: Array<number>;
}

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

	const sentenceFrom = (word: number, limit: number): number => {
		let at = word;

		while (at > 0 && at < limit && sentenceOf[at] === sentenceOf[at - 1]) {
			at += 1;
		}

		return at;
	};

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

	const place = (
		within: ReadonlyArray<Tie>,
		from: Cut,
		to: Cut,
		depth: number
	): Array<Placed | undefined> => {
		const chain = steadyTies(longestChain(within));
		const placed = region(chain, from, to);

		for (const stray of depth < DEEPEST ? straysOf(within, chain) : []) {
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

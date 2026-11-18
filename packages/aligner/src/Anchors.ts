/** A word of the book and a word the model heard that are surely the same: a tie between them. */
export interface Tie {
	/** The book word's index. */
	readonly word: number;
	/** The heard word's index. */
	readonly heard: number;
}

/** Words compared without apostrophes, which the model and the book disagree on. */
const keyOf = (word: string) => word.replaceAll("'", "");

/**
 * Every run of `n` words that appears exactly once in `book` and once in `heard`, in the book's
 * order: each could be a tie.
 */
export const candidatesOf = (
	book: ReadonlyArray<string>,
	heard: ReadonlyArray<string>,
	n: number
): Array<Tie> => {
	const grams = (words: ReadonlyArray<string>) => {
		const seen = new Map<string, number>();

		for (let i = 0; i + n <= words.length; i += 1) {
			const gram = words
				.slice(i, i + n)
				.map(keyOf)
				.join(" ");

			seen.set(gram, seen.has(gram) ? -1 : i);
		}

		return seen;
	};

	const inBook = grams(book);
	const inHeard = grams(heard);
	const candidates: Array<Tie> = [];

	for (const [gram, word] of inBook) {
		const at = inHeard.get(gram);

		if (word >= 0 && at !== undefined && at >= 0) {
			candidates.push({ word, heard: at });
		}
	}

	return candidates.toSorted((a, b) => a.word - b.word);
};

/**
 * Ties between `book` and `heard`, in order in both: the longest chain of candidates in the same
 * order in both. Text the narrator skipped and narration the book lacks fall between ties.
 */
export const tiesOf = (
	book: ReadonlyArray<string>,
	heard: ReadonlyArray<string>,
	n: number
): Array<Tie> => longestChain(candidatesOf(book, heard, n));

/** The longest run of ties whose heard indexes rise with their book indexes. */
export const longestChain = (candidates: ReadonlyArray<Tie>): Array<Tie> => {
	// Patience sorting: tails[k] is the candidate ending the best chain of length k + 1.
	const tails: Array<number> = [];
	const before = new Int32Array(candidates.length).fill(-1);

	for (const [index, tie] of candidates.entries()) {
		let low = 0;
		let high = tails.length;

		while (low < high) {
			const middle = Math.floor((low + high) / 2);

			if ((candidates[tails[middle] ?? 0]?.heard ?? 0) < tie.heard) {
				low = middle + 1;
			} else {
				high = middle;
			}
		}

		before[index] = low > 0 ? (tails[low - 1] ?? -1) : -1;
		tails[low] = index;
	}

	const chain: Array<Tie> = [];
	let at = tails.at(-1) ?? -1;

	while (at !== -1) {
		const tie = candidates[at];

		if (tie) {
			chain.push(tie);
		}

		at = before[at] ?? -1;
	}

	return chain.toReversed();
};

/**
 * Drop ties that stand alone: a true tie has a neighbour within `near` words whose offset (heard
 * index less book index) is close to its own. A lone tie is a coincidence of wording.
 */
export const steadyTies = (
	ties: ReadonlyArray<Tie>,
	near = 60,
	drift = 4
): Array<Tie> =>
	ties.filter((tie, index) =>
		[ties[index - 1], ties[index + 1]].some(
			(other) =>
				other !== undefined &&
				Math.abs(other.word - tie.word) <= near &&
				Math.abs(other.heard - other.word - (tie.heard - tie.word)) <= drift
		)
	);

/** A run of ties out of step with the chain: text from one gap of it, heard in another. */
export interface Stray {
	/** The run's candidates, in the book's order. They may hold runs out of step with each other. */
	readonly candidates: ReadonlyArray<Tie>;
	/** The chain's ties before and after the run's words, if any. */
	readonly wordsAfter: Tie | undefined;
	readonly wordsBefore: Tie | undefined;
	/** The chain's ties before and after where the run was heard, if any. */
	readonly heardAfter: Tie | undefined;
	readonly heardBefore: Tie | undefined;
}

/** How many of `sorted` are less than or equal to `value`. */
const countUpTo = (sorted: ReadonlyArray<number>, value: number): number => {
	let low = 0;
	let high = sorted.length;

	while (low < high) {
		const middle = Math.floor((low + high) / 2);

		if ((sorted[middle] ?? 0) <= value) {
			low = middle + 1;
		} else {
			high = middle;
		}
	}

	return low;
};

/**
 * Runs of candidates the chain left out because the audio is not in the book's order: audio files
 * played in the wrong order, or a chapter read out of place. Such a run's words sit in one gap of
 * the chain and were heard in another, and it has at least `least` ties that agree with each other;
 * chance matches do not come in runs.
 */
export const straysOf = (
	candidates: ReadonlyArray<Tie>,
	chain: ReadonlyArray<Tie>,
	least = 20
): Array<Stray> => {
	const chainWords = chain.map((tie) => tie.word);
	const chainHeard = chain.map((tie) => tie.heard);
	const groups = new Map<string, Array<Tie>>();

	for (const tie of candidates) {
		const wordGap = countUpTo(chainWords, tie.word);
		const heardGap = countUpTo(chainHeard, tie.heard);

		if (wordGap !== heardGap) {
			const key = `${wordGap}:${heardGap}`;
			const group = groups.get(key) ?? [];

			group.push(tie);
			groups.set(key, group);
		}
	}

	return [...groups].flatMap(([key, group]) => {
		const ties = group.length < least ? [] : steadyTies(longestChain(group));
		const [wordGap = 0, heardGap = 0] = key.split(":").map(Number);

		return ties.length < least
			? []
			: [
					{
						candidates: group,
						wordsAfter: chain[wordGap - 1],
						wordsBefore: chain[wordGap],
						heardAfter: chain[heardGap - 1],
						heardBefore: chain[heardGap],
					},
				];
	});
};

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
 * Ties between `book` and `heard`, in order in both: every run of `n` words that appears exactly
 * once in each is a candidate, and the longest chain of candidates in the same order in both is
 * kept. Text the narrator skipped and narration the book lacks fall between ties.
 */
export const tiesOf = (
	book: ReadonlyArray<string>,
	heard: ReadonlyArray<string>,
	n: number
): Array<Tie> => {
	const grams = (words: ReadonlyArray<string>) => {
		const seen = new Map<string, number>();

		for (let i = 0; i + n <= words.length; i++) {
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

	candidates.sort((a, b) => a.word - b.word);

	return longestChain(candidates);
};

/** The longest run of ties whose heard indexes rise with their book indexes. */
const longestChain = (candidates: ReadonlyArray<Tie>): Array<Tie> => {
	// Patience sorting: tails[k] is the candidate ending the best chain of length k + 1.
	const tails: Array<number> = [];
	const before = new Int32Array(candidates.length).fill(-1);

	for (const [index, tie] of candidates.entries()) {
		let low = 0;
		let high = tails.length;

		while (low < high) {
			const middle = (low + high) >> 1;

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

	return chain.reverse();
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

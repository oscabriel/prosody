import type { Emissions } from "./Emissions.ts";
import { scoreOf } from "./Emissions.ts";

/** A run of text to place in the audio: the model's tokens for one sentence, or part of one. */
export interface Unit {
	readonly tokens: ReadonlyArray<number>;
}

/** Where a unit landed: the first and last frame its tokens hold, and how well they were heard. */
export interface Placed {
	readonly from: number;
	readonly to: number;
	/** The mean log-probability of its tokens where they start. */
	readonly score: number;
}

/** What it costs to leave a unit out: less than forcing text that is not there, more than noise. */
export const SKIP = -10;

/** What a frame of audio that matches no text costs, over the frame's best guess. */
export const GARBAGE = -3;

const NONE = -Infinity;

/** Backpointer codes: 0 to 4 step back that many states; this one jumps over a skipped unit. */
const SKIPPED = 5;

/**
 * Place `units` in frames `from` to `to` (exclusive) with CTC's Viterbi. Between units the path may
 * pass through a garbage state that absorbs audio with no text, and may skip a whole unit; a unit
 * the path skips comes back `undefined`, so text nobody read is decided here, not guessed later.
 *
 * States, in order: G0, then for each unit its blanks and tokens (b t1 b t2 ... tn b) and a G after
 * it. Every transition is to the same state or one to four states on, so a backpointer is a byte.
 */
export const forceAlign = (
	emissions: Emissions,
	from: number,
	to: number,
	units: ReadonlyArray<Unit>
): Array<Placed | undefined> => {
	const frames = to - from;
	const result = Array.from<Placed | undefined>({ length: units.length });

	if (frames <= 0 || units.length === 0) {
		return result;
	}

	// The tokens this stretch uses, each a column of a small dense table of scores.
	const columns = new Map<number, number>();

	for (const unit of units) {
		for (const token of unit.tokens) {
			if (!columns.has(token)) {
				columns.set(token, columns.size);
			}
		}
	}

	const width = columns.size;
	const table = new Float32Array(frames * width);

	for (let t = 0; t < frames; t++) {
		for (const [token, column] of columns) {
			table[t * width + column] = scoreOf(emissions, from + t, token);
		}
	}

	const blank = emissions.blank.subarray(from, to);
	const garbage = new Float32Array(frames);

	for (let t = 0; t < frames; t++) {
		const best = emissions.scores[(from + t) * emissions.kept] ?? NONE;
		garbage[t] = Math.max(best, blank[t] ?? NONE) + GARBAGE;
	}

	// Lay out the states.
	const unitStart: Array<number> = [];
	const garbageAt: Array<number> = [0];
	let count = 1;

	for (const unit of units) {
		unitStart.push(count);
		count += 2 * unit.tokens.length + 1;
		garbageAt.push(count);
		count += 1;
	}

	// For each state: -1 for garbage, -2 for blank, or the token's column; and its unit and place.
	const kind = new Int32Array(count).fill(-1);
	const unitOf = new Int32Array(count).fill(-1);
	const place = new Int32Array(count).fill(-1);

	for (const [k, unit] of units.entries()) {
		const start = unitStart[k] ?? 0;

		for (let p = 0; p <= 2 * unit.tokens.length; p++) {
			kind[start + p] =
				p % 2 === 0 ? -2 : (columns.get(unit.tokens[(p - 1) / 2] ?? 0) ?? 0);
			unitOf[start + p] = k;
			place[start + p] = p;
		}
	}

	const emit = (state: number, t: number): number => {
		const k = kind[state] ?? -1;

		if (k === -1) {
			return garbage[t] ?? NONE;
		}

		if (k === -2) {
			return blank[t] ?? NONE;
		}

		return table[t * width + k] ?? NONE;
	};

	let previous = new Float32Array(count).fill(NONE);
	let current = new Float32Array(count).fill(NONE);
	const back = new Uint8Array(count * frames);

	const skipForward = (scores: Float32Array, t: number) => {
		for (let g = 1; g < garbageAt.length; g++) {
			const here = garbageAt[g] ?? 0;
			const before = garbageAt[g - 1] ?? 0;
			const skipped = (scores[before] ?? NONE) + SKIP;

			if (skipped > (scores[here] ?? NONE)) {
				scores[here] = skipped;
				back[t * count + here] = SKIPPED;
			}
		}
	};

	const first = unitStart[0] ?? 1;
	previous[0] = emit(0, 0);
	previous[first] = emit(first, 0);
	previous[first + 1] = emit(first + 1, 0);
	skipForward(previous, 0);

	for (let t = 1; t < frames; t++) {
		current.fill(NONE);

		for (let s = 0; s < count; s++) {
			let best = previous[s] ?? NONE;
			let code = 0;

			const consider = (delta: number) => {
				const value = previous[s - delta] ?? NONE;

				if (value > best) {
					best = value;
					code = delta;
				}
			};

			const k = unitOf[s] ?? -1;
			const p = place[s] ?? -1;

			if (k === -1) {
				// Garbage after a unit: from its last blank or last token.
				if (s > 0) {
					consider(1);
					consider(2);
				}
			} else if (p === 0) {
				consider(1);

				if (k > 0) {
					consider(2);
					consider(3);
				}
			} else if (p === 1) {
				consider(1);
				consider(2);

				if (k > 0) {
					consider(3);

					if ((kind[s - 4] ?? -1) !== (kind[s] ?? -1)) {
						consider(4);
					}
				}
			} else if (p % 2 === 0) {
				consider(1);
			} else {
				consider(1);

				if ((kind[s - 2] ?? -1) !== (kind[s] ?? -1)) {
					consider(2);
				}
			}

			if (best !== NONE) {
				current[s] = best + emit(s, t);
				back[t * count + s] = code;
			}
		}

		skipForward(current, t);
		[previous, current] = [current, previous];
	}

	// The path ends in the last garbage state or at the end of the last unit.
	const lastGarbage = garbageAt.at(-1) ?? 0;
	let state = lastGarbage;

	for (const candidate of [lastGarbage - 1, lastGarbage - 2]) {
		if ((previous[candidate] ?? NONE) > (previous[state] ?? NONE)) {
			state = candidate;
		}
	}

	const firstFrame = new Int32Array(units.length).fill(-1);
	const lastFrame = new Int32Array(units.length).fill(-1);
	const total = new Float64Array(units.length);
	const entered = new Int32Array(units.length);

	for (let t = frames - 1; t >= 0; t--) {
		while (back[t * count + state] === SKIPPED) {
			const g = garbageAt.indexOf(state);
			state = garbageAt[g - 1] ?? 0;
		}

		const k = unitOf[state] ?? -1;
		const code = t === 0 ? 0 : (back[t * count + state] ?? 0);

		if (k !== -1 && (kind[state] ?? -1) >= 0) {
			if ((lastFrame[k] ?? -1) === -1) {
				lastFrame[k] = t;
			}

			firstFrame[k] = t;

			// Entering a token: count its score once.
			if (code !== 0) {
				total[k] = (total[k] ?? 0) + emit(state, t);
				entered[k] = (entered[k] ?? 0) + 1;
			}
		}

		state -= code;
	}

	for (let k = 0; k < units.length; k++) {
		if ((firstFrame[k] ?? -1) !== -1) {
			result[k] = {
				from: from + (firstFrame[k] ?? 0),
				to: from + (lastFrame[k] ?? 0),
				score: (total[k] ?? 0) / Math.max(1, entered[k] ?? 0),
			};
		}
	}

	return result;
};

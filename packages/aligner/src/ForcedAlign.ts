import type { Emissions } from "./Emissions.ts";
import { scoreOf } from "./Emissions.ts";

export interface Unit {
	readonly tokens: ReadonlyArray<number>;
}

export interface Placed {
	readonly from: number;
	readonly to: number;
	readonly score: number;
}

export interface Costs {
	readonly skip: number;
	readonly garbage: number;
	readonly leastScore: number;
}

export const COSTS: Costs = {
	skip: -10,
	garbage: -3,
	leastScore: -4,
};

const NONE = -Infinity;

const SKIPPED = 5;

interface Lattice {
	readonly kind: Int32Array;
	readonly table: Float32Array;
	readonly width: number;
	readonly blank: Float32Array;
	readonly garbage: Float32Array;
}

interface States {
	readonly count: number;
	readonly unitStart: ReadonlyArray<number>;
	readonly garbageAt: ReadonlyArray<number>;
	readonly unitOf: Int32Array;
	readonly reach: Uint8Array;
}

const columnsOf = (units: ReadonlyArray<Unit>): Map<number, number> => {
	const columns = new Map<number, number>();

	for (const unit of units) {
		for (const token of unit.tokens) {
			if (!columns.has(token)) {
				columns.set(token, columns.size);
			}
		}
	}

	return columns;
};

const tableOf = (
	emissions: Emissions,
	from: number,
	frames: number,
	columns: ReadonlyMap<number, number>
): Float32Array => {
	const width = columns.size;
	const table = new Float32Array(frames * width);

	for (let t = 0; t < frames; t += 1) {
		for (const [token, column] of columns) {
			table[t * width + column] = scoreOf(emissions, from + t, token);
		}
	}

	return table;
};

const garbageOf = (
	emissions: Emissions,
	from: number,
	blank: Float32Array,
	cost: number
): Float32Array => {
	const garbage = new Float32Array(blank.length);

	for (let t = 0; t < blank.length; t += 1) {
		const best = emissions.scores[(from + t) * emissions.kept] ?? NONE;
		garbage[t] = Math.max(best, blank[t] ?? NONE) + cost;
	}

	return garbage;
};

const unitReach = (
	kind: Int32Array,
	state: number,
	place: number,
	unit: number
): number => {
	if (place === 0) {
		return unit > 0 ? 3 : 1;
	}

	if (place === 1) {
		if (unit === 0) {
			return 2;
		}

		return (kind[state - 4] ?? -1) === (kind[state] ?? -1) ? 3 : 4;
	}

	if (place % 2 === 0) {
		return 1;
	}

	return (kind[state - 2] ?? -1) === (kind[state] ?? -1) ? 1 : 2;
};

const layOut = (
	units: ReadonlyArray<Unit>,
	columns: ReadonlyMap<number, number>
) => {
	const unitStart: Array<number> = [];
	const garbageAt: Array<number> = [0];
	let count = 1;

	for (const unit of units) {
		unitStart.push(count);
		count += 2 * unit.tokens.length + 1;
		garbageAt.push(count);
		count += 1;
	}

	const kind = new Int32Array(count).fill(-1);
	const unitOf = new Int32Array(count).fill(-1);
	const reach = new Uint8Array(count);

	for (const g of garbageAt) {
		reach[g] = g > 0 ? 2 : 0;
	}

	for (const [k, unit] of units.entries()) {
		const start = unitStart[k] ?? 0;

		for (let p = 0; p <= 2 * unit.tokens.length; p += 1) {
			kind[start + p] =
				p % 2 === 0 ? -2 : (columns.get(unit.tokens[(p - 1) / 2] ?? 0) ?? 0);
			unitOf[start + p] = k;
		}

		for (let p = 0; p <= 2 * unit.tokens.length; p += 1) {
			reach[start + p] = unitReach(kind, start + p, p, k);
		}
	}

	return { states: { count, unitStart, garbageAt, unitOf, reach }, kind };
};

const emit = (lattice: Lattice, state: number, t: number): number => {
	const k = lattice.kind[state] ?? -1;

	if (k === -1) {
		return lattice.garbage[t] ?? NONE;
	}

	if (k === -2) {
		return lattice.blank[t] ?? NONE;
	}

	return lattice.table[t * lattice.width + k] ?? NONE;
};

const skipForward = (
	states: States,
	back: Uint8Array,
	scores: Float32Array,
	t: number,
	skip: number
) => {
	const { garbageAt, count } = states;

	for (let g = 1; g < garbageAt.length; g += 1) {
		const here = garbageAt[g] ?? 0;
		const before = garbageAt[g - 1] ?? 0;
		const skipped = (scores[before] ?? NONE) + skip;

		if (skipped > (scores[here] ?? NONE)) {
			scores[here] = skipped;
			back[t * count + here] = SKIPPED;
		}
	}
};

const viterbi = (
	lattice: Lattice,
	states: States,
	frames: number,
	skip: number
) => {
	const { count, reach } = states;
	const first = states.unitStart[0] ?? 1;
	let previous = new Float32Array(count).fill(NONE);
	let current = new Float32Array(count).fill(NONE);
	const back = new Uint8Array(count * frames);

	previous[0] = emit(lattice, 0, 0);
	previous[first] = emit(lattice, first, 0);
	previous[first + 1] = emit(lattice, first + 1, 0);
	skipForward(states, back, previous, 0, skip);

	for (let t = 1; t < frames; t += 1) {
		current.fill(NONE);

		for (let s = 0; s < count; s += 1) {
			let best = previous[s] ?? NONE;
			let code = 0;
			const steps = reach[s] ?? 0;

			for (let delta = 1; delta <= steps; delta += 1) {
				const value = previous[s - delta] ?? NONE;

				if (value > best) {
					best = value;
					code = delta;
				}
			}

			if (best !== NONE) {
				current[s] = best + emit(lattice, s, t);
				back[t * count + s] = code;
			}
		}

		skipForward(states, back, current, t, skip);
		[previous, current] = [current, previous];
	}

	return { back, last: previous };
};

const endOf = (states: States, last: Float32Array): number => {
	const lastGarbage = states.garbageAt.at(-1) ?? 0;
	let state = lastGarbage;

	for (const candidate of [lastGarbage - 1, lastGarbage - 2]) {
		if ((last[candidate] ?? NONE) > (last[state] ?? NONE)) {
			state = candidate;
		}
	}

	return state;
};

const traceBack = (
	lattice: Lattice,
	states: States,
	back: Uint8Array,
	end: number,
	units: number
) => {
	const { count, garbageAt, unitOf } = states;
	const frames = back.length / count;
	const firstFrame = new Int32Array(units).fill(-1);
	const lastFrame = new Int32Array(units).fill(-1);
	const total = new Float64Array(units);
	const entered = new Int32Array(units);
	let state = end;

	for (let t = frames - 1; t >= 0; t -= 1) {
		while (back[t * count + state] === SKIPPED) {
			const g = garbageAt.indexOf(state);
			state = garbageAt[g - 1] ?? 0;
		}

		const k = unitOf[state] ?? -1;
		const code = t === 0 ? 0 : (back[t * count + state] ?? 0);

		if (k !== -1 && (lattice.kind[state] ?? -1) >= 0) {
			if ((lastFrame[k] ?? -1) === -1) {
				lastFrame[k] = t;
			}

			firstFrame[k] = t;

			if (code !== 0) {
				total[k] = (total[k] ?? 0) + emit(lattice, state, t);
				entered[k] = (entered[k] ?? 0) + 1;
			}
		}

		state -= code;
	}

	return { firstFrame, lastFrame, total, entered };
};

export const forceAlign = (
	emissions: Emissions,
	from: number,
	to: number,
	units: ReadonlyArray<Unit>,
	costs: Costs = COSTS
): Array<Placed | undefined> => {
	const frames = to - from;
	const result = Array.from<Placed | undefined>({ length: units.length });

	if (frames <= 0 || units.length === 0) {
		return result;
	}

	const columns = columnsOf(units);
	const blank = emissions.blank.subarray(from, to);
	const { states, kind } = layOut(units, columns);

	const lattice: Lattice = {
		kind,
		table: tableOf(emissions, from, frames, columns),
		width: columns.size,
		blank,
		garbage: garbageOf(emissions, from, blank, costs.garbage),
	};

	const { back, last } = viterbi(lattice, states, frames, costs.skip);

	const { firstFrame, lastFrame, total, entered } = traceBack(
		lattice,
		states,
		back,
		endOf(states, last),
		units.length
	);

	for (let k = 0; k < units.length; k += 1) {
		const score = (total[k] ?? 0) / Math.max(1, entered[k] ?? 0);

		if ((firstFrame[k] ?? -1) !== -1 && score >= costs.leastScore) {
			result[k] = {
				from: from + (firstFrame[k] ?? 0),
				to: from + (lastFrame[k] ?? 0),
				score,
			};
		}
	}

	return result;
};

import type { Emissions } from "./Emissions.ts";
import type { Placed } from "./ForcedAlign.ts";

/** A sentence's clip, in seconds of the whole book. */
export interface Clip {
	readonly start: number;
	readonly end: number;
}

/** How the frames' times are read. Tuned against Whisper's word times on the six books. */
export interface Tuning {
	/** Seconds added to a token's frame time to reach where its sound starts (usually negative). */
	readonly lead: number;
	/** How far a start may move back, and an end forward, to reach quiet. */
	readonly reachBack: number;
	readonly reachForward: number;
	/** Loudness this many decibels over the book's quiet counts as sound. */
	readonly overQuiet: number;
}

export const TUNING: Tuning = {
	lead: -0.04,
	reachBack: 0.3,
	reachForward: 0.15,
	overQuiet: 25,
};

/** The loudness most of the book's quiet sits under: its tenth percentile. */
const quietOf = (loudness: Float32Array): number => {
	const sample: Array<number> = [];
	const step = Math.max(1, Math.floor(loudness.length / 50_000));

	for (let i = 0; i < loudness.length; i += step) {
		sample.push(loudness[i] ?? 0);
	}

	sample.sort((a, b) => a - b);

	return sample[Math.floor(sample.length / 10)] ?? -100;
};

/**
 * Each placed sentence's clip. A start moves back through sound to the quiet before it, and an end
 * runs on through sound to the quiet after it, each only so far and never into a neighbour. An end
 * never stretches across a pause to the next sentence: the quiet between them belongs to neither.
 */
export const clipsOf = (
	emissions: Emissions,
	placed: ReadonlyArray<Placed | undefined>,
	tuning: Tuning = TUNING
): Array<Clip | undefined> => {
	const step = emissions.secondsPerLoudness;
	const sound = quietOf(emissions.loudness) + tuning.overQuiet;

	const loud = (seconds: number) =>
		(emissions.loudness[Math.floor(seconds / step)] ?? -100) > sound;

	const total = emissions.frames * emissions.secondsPerFrame;

	const rough = placed.map((p) =>
		p
			? {
					start: Math.max(0, p.from * emissions.secondsPerFrame + tuning.lead),
					end: Math.min(
						total,
						(p.to + 1) * emissions.secondsPerFrame + tuning.lead
					),
				}
			: undefined
	);

	// The nearest placed neighbours' edges, found once each way.
	const endBefore = new Float64Array(rough.length);
	const startAfter = new Float64Array(rough.length);
	let edge = 0;

	for (const [index, clip] of rough.entries()) {
		endBefore[index] = edge;
		edge = clip ? clip.end : edge;
	}

	edge = total;

	for (let index = rough.length - 1; index >= 0; index -= 1) {
		startAfter[index] = edge;
		edge = rough[index]?.start ?? edge;
	}

	/** Move a clip's edges out through sound, to quiet, within its reach and its neighbours. */
	const settle = (clip: Clip, index: number): Clip => {
		const floor = Math.max(
			endBefore[index] ?? 0,
			clip.start - tuning.reachBack
		);

		const ceiling = Math.min(
			startAfter[index] ?? total,
			clip.end + tuning.reachForward
		);

		let { start } = clip;
		let { end } = clip;

		while (start - step >= floor && loud(start - step)) {
			start -= step;
		}

		while (end + step <= ceiling && loud(end)) {
			end += step;
		}

		return { start, end: Math.max(end, start + step) };
	};

	return rough.map((clip, index) => (clip ? settle(clip, index) : undefined));
};

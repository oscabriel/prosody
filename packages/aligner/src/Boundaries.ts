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
	/**
	 * An end runs on across quiet shorter than this. A stop's closure ("sys-tem") is 20 to 60 ms of
	 * quiet inside a word; the pause after a sentence is longer.
	 */
	readonly bridge: number;
	/**
	 * Loudness counts as sound within this many decibels of the book's speech, and at least
	 * `overQuiet` over its quiet. Speech spans about 40 dB; a studio's silence sits far under that,
	 * and a noisy recording's does not, which is what the second bound is for.
	 */
	readonly underSpeech: number;
	readonly overQuiet: number;
}

export const TUNING: Tuning = {
	lead: -0.04,
	reachBack: 0.3,
	reachForward: 0.45,
	bridge: 0.06,
	underSpeech: 40,
	overQuiet: 10,
};

/**
 * The loudness that counts as sound: under the book's speech (its ninetieth percentile) by
 * `underSpeech`, and over its quiet (its tenth percentile) by `overQuiet`, whichever is higher.
 */
const soundOf = (loudness: Float32Array, tuning: Tuning): number => {
	const sample: Array<number> = [];
	const step = Math.max(1, Math.floor(loudness.length / 50_000));

	for (let i = 0; i < loudness.length; i += step) {
		sample.push(loudness[i] ?? 0);
	}

	sample.sort((a, b) => a - b);

	const quiet = sample[Math.floor(sample.length / 10)] ?? -100;
	const speech = sample[Math.floor((sample.length * 9) / 10)] ?? 0;

	return Math.max(speech - tuning.underSpeech, quiet + tuning.overQuiet);
};

/**
 * Each placed sentence's clip. A start moves back through sound to the quiet before it, and an end
 * runs on through sound to the quiet after it, each only so far and never into a neighbour. An end
 * never stretches across a pause to the next sentence: the quiet between them belongs to neither.
 *
 * Times are counted in steps of the loudness (10 ms) until the end, so no edge lands between two.
 */
export const clipsOf = (
	emissions: Emissions,
	placed: ReadonlyArray<Placed | undefined>,
	tuning: Tuning = TUNING
): Array<Clip | undefined> => {
	const step = emissions.secondsPerLoudness;
	const sound = soundOf(emissions.loudness, tuning);
	const steps = (seconds: number) => Math.round(seconds / step);
	const loud = (at: number) => (emissions.loudness[at] ?? -100) > sound;
	const total = steps(emissions.frames * emissions.secondsPerFrame);

	const rough = placed.map((p) =>
		p
			? {
					start: Math.max(
						0,
						steps(p.from * emissions.secondsPerFrame + tuning.lead)
					),
					end: Math.min(
						total,
						steps((p.to + 1) * emissions.secondsPerFrame + tuning.lead)
					),
				}
			: undefined
	);

	// The placed sentences in the audio's order, which is the book's unless the audio was read or
	// filed out of order. A sentence's neighbours are the ones heard before and after it.
	const inOrder = rough
		.flatMap((clip, index) => (clip ? [{ index, start: clip.start }] : []))
		.toSorted((a, b) => a.start - b.start)
		.map((entry) => entry.index);

	// The neighbours' edges, found once each way.
	const endBefore = new Int32Array(rough.length);
	const startAfter = new Int32Array(rough.length);
	let edge = 0;

	for (const index of inOrder) {
		endBefore[index] = edge;
		edge = Math.max(edge, rough[index]?.end ?? edge);
	}

	edge = total;

	for (const index of inOrder.toReversed()) {
		startAfter[index] = edge;
		edge = rough[index]?.start ?? edge;
	}

	/** Move a clip's edges out through sound, to quiet, within its reach and its neighbours. */
	const settle = (clip: Clip, index: number): Clip => {
		const floor = Math.max(
			endBefore[index] ?? 0,
			clip.start - steps(tuning.reachBack)
		);

		const ceiling = Math.min(
			startAfter[index] ?? total,
			clip.end + steps(tuning.reachForward)
		);

		let { start } = clip;
		let { end } = clip;

		while (start > floor && loud(start - 1)) {
			start -= 1;
		}

		// On through sound, and across quiet too short to be a pause, to the last sound before one.
		let quiet = 0;

		for (
			let at = clip.end;
			at < ceiling && quiet <= steps(tuning.bridge);
			at += 1
		) {
			if (loud(at)) {
				end = at + 1;
				quiet = 0;
			} else {
				quiet += 1;
			}
		}

		return { start, end: Math.max(end, start + 1) };
	};

	/** The quietest step from `from` to `to`: where one sentence gives way to the next. */
	const quietest = (from: number, to: number): number => {
		let best = from;

		for (let at = from; at <= to; at += 1) {
			if (
				(emissions.loudness[at] ?? -100) < (emissions.loudness[best] ?? -100)
			) {
				best = at;
			}
		}

		return best;
	};

	const clips = rough.map((clip, index) =>
		clip ? settle(clip, index) : undefined
	);

	// Where speech runs on, an end and the next start each reach across the same sound. They meet
	// at its quietest moment, so no audio belongs to two sentences.
	let before: number | undefined;

	for (const index of inOrder) {
		const clip = clips[index];
		const previous = before === undefined ? undefined : clips[before];

		if (clip && previous && before !== undefined && previous.end > clip.start) {
			const meet = quietest(clip.start, Math.min(previous.end, clip.end - 1));

			clips[before] = { start: previous.start, end: meet };
			clips[index] = { start: meet, end: clip.end };
		}

		before = index;
	}

	return clips.map((clip) =>
		clip ? { start: clip.start * step, end: clip.end * step } : undefined
	);
};

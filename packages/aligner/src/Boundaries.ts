import type { Emissions } from "./Emissions.ts";
import type { Placed } from "./ForcedAlign.ts";

export interface Clip {
	readonly start: number;
	readonly end: number;
}

export interface Tuning {
	readonly lead: number;
	readonly reachBack: number;
	readonly reachForward: number;
	readonly bridge: number;
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

	const inOrder = rough
		.flatMap((clip, index) => (clip ? [{ index, start: clip.start }] : []))
		.toSorted((a, b) => a.start - b.start)
		.map((entry) => entry.index);

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

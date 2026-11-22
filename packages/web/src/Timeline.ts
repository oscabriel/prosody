import type {
	Chapter,
	Contents,
	Entry,
	Timeline,
} from "@prosody/domain/Reading/Copy";
import { Sentence } from "@prosody/domain/Reading/Sentence";

export interface Heard {
	readonly sentence: Sentence;
	readonly start: number;
	readonly end: number;
}

const isHeard = (entry: Entry): entry is Entry & Heard =>
	entry.start !== undefined && entry.end !== undefined;

const heardCache = new WeakMap<Timeline, ReadonlyArray<Heard>>();

export const heardOf = (timeline: Timeline): ReadonlyArray<Heard> => {
	const cached = heardCache.get(timeline);

	if (cached !== undefined) {
		return cached;
	}

	const heard = timeline.filter(isHeard).toSorted((a, b) => a.start - b.start);

	heardCache.set(timeline, heard);

	return heard;
};

export const sectionOf = (sentence: string): string =>
	sentence.split("#")[0] ?? "";

export const spanOf = (sentence: string): string =>
	sentence.split("#")[1] ?? "";

export const indexOf = (contents: Contents, path: string): number =>
	contents.sections.findIndex((section) => section.path === path);

export const sentenceAt = (
	heard: ReadonlyArray<Heard>,
	time: number
): Sentence | undefined => {
	let low = 0;
	let high = heard.length - 1;
	let found: Heard | undefined;

	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const entry = heard[middle];

		if (entry !== undefined && entry.start <= time) {
			found = entry;
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}

	return found?.sentence;
};

export const startOf = (
	timeline: Timeline,
	sentence: string
): number | undefined => {
	const at = timeline.findIndex((entry) => entry.sentence === sentence);

	if (at === -1) {
		return undefined;
	}

	return timeline.slice(at).find(isHeard)?.start;
};

export const firstOn = (
	timeline: Timeline,
	path: string
): Sentence | undefined =>
	timeline.find((entry) => sectionOf(entry.sentence) === path)?.sentence;

export const chapterAt = (
	chapters: ReadonlyArray<Chapter>,
	time: number
): number =>
	Math.max(
		0,
		chapters.findLastIndex((chapter) => chapter.start <= time)
	);

export const sentenceOf = (path: string, span: string): Sentence =>
	Sentence.make(`${path}#${span}`);

export interface Stretch {
	readonly start: number;
	readonly end: number;
}

const stretchCache = new WeakMap<
	ReadonlyArray<Heard>,
	ReadonlyMap<string, Stretch>
>();

const stretchesOf = (
	heard: ReadonlyArray<Heard>
): ReadonlyMap<string, Stretch> => {
	const cached = stretchCache.get(heard);

	if (cached !== undefined) {
		return cached;
	}

	const stretches = new Map<string, Stretch>();

	for (const { sentence, start, end } of heard) {
		const path = sectionOf(sentence);
		const known = stretches.get(path);

		stretches.set(
			path,
			known === undefined
				? { start, end }
				: {
						start: Math.min(known.start, start),
						end: Math.max(known.end, end),
					}
		);
	}

	stretchCache.set(heard, stretches);

	return stretches;
};

export const sectionBounds = (
	heard: ReadonlyArray<Heard>,
	path: string
): Stretch | undefined => stretchesOf(heard).get(path);

export const sectionDuration = (
	heard: ReadonlyArray<Heard>,
	path: string
): number => {
	const bounds = sectionBounds(heard, path);

	return bounds === undefined ? 0 : bounds.end - bounds.start;
};

export const bookDuration = (heard: ReadonlyArray<Heard>): number => {
	let latest = 0;

	for (const stretch of stretchesOf(heard).values()) {
		latest = Math.max(latest, stretch.end);
	}

	return latest;
};

export const lengthOf = (stretch: Stretch): number =>
	Math.max(0, stretch.end - stretch.start);

export const timeIn = (stretch: Stretch, time: number): number =>
	Math.min(lengthOf(stretch), Math.max(0, time - stretch.start));

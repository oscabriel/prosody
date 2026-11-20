import type {
	Chapter,
	Contents,
	Entry,
	Timeline,
} from "@prosody/domain/Reading/Copy";
import { Sentence } from "@prosody/domain/Reading/Sentence";

/** A sentence the audio holds: its place, start and end in seconds. */
export interface Heard {
	readonly sentence: Sentence;
	readonly start: number;
	readonly end: number;
}

const isHeard = (entry: Entry): entry is Entry & Heard =>
	entry.start !== undefined && entry.end !== undefined;

const heardCache = new WeakMap<Timeline, ReadonlyArray<Heard>>();

/** The sentences the audio holds, in the order it plays them. Worked out once per timeline. */
export const heardOf = (timeline: Timeline): ReadonlyArray<Heard> => {
	const cached = heardCache.get(timeline);

	if (cached !== undefined) {
		return cached;
	}

	const heard = timeline.filter(isHeard).toSorted((a, b) => a.start - b.start);

	heardCache.set(timeline, heard);

	return heard;
};

/** The page a sentence is on. */
export const pageOf = (sentence: string): string =>
	sentence.split("#")[0] ?? "";

/** The span a sentence is marked with on its page. */
export const spanOf = (sentence: string): string =>
	sentence.split("#")[1] ?? "";

/** A page's index in the contents, or -1. */
export const indexOf = (contents: Contents, path: string): number =>
	contents.pages.findIndex((page) => page.path === path);

/**
 * The sentence being read at `time`: the last one to start at or before it. Between two sentences
 * it is still the one before, so the underline does not flicker in a pause.
 */
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

/**
 * Where to play `sentence` from: its own start, or, for text the narrator did not read, the start
 * of the next sentence that was read.
 */
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

/** The seconds of audio left on a page from `time`, or 0 when its audio is behind. */
export const leftOnPage = (
	heard: ReadonlyArray<Heard>,
	path: string,
	time: number
): number => {
	const last = heard.findLast((entry) => pageOf(entry.sentence) === path);

	return last === undefined ? 0 : Math.max(0, last.end - time);
};

/** The first sentence on a page, read or not. */
export const firstOn = (
	timeline: Timeline,
	path: string
): Sentence | undefined =>
	timeline.find((entry) => pageOf(entry.sentence) === path)?.sentence;

/** The chapter of the audio playing at `time`: the last to start at or before it. */
export const chapterAt = (
	chapters: ReadonlyArray<Chapter>,
	time: number
): number =>
	Math.max(
		0,
		chapters.findLastIndex((chapter) => chapter.start <= time)
	);

/** `ps-12` on `path`, as a place. */
export const sentenceOf = (path: string, span: string): Sentence =>
	Sentence.make(`${path}#${span}`);

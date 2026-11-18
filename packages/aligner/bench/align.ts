/**
 * Align one book from saved emissions, and write its timeline as JSON: every sentence, its page and
 * id, its text, and its clip or none.
 *
 *   PROSODY_ALIGNER_MODELS=<dir> bun bench/align.ts <book.emissions> <book.epub> <timeline.json>
 */
import { readFileSync, writeFileSync } from "node:fs";

import { AutoTokenizer, env } from "@huggingface/transformers";
import { strFromU8 } from "fflate";

import { MODEL } from "../src/Acoustic.ts";
import { align } from "../src/Align.ts";
import { TUNING, clipsOf } from "../src/Boundaries.ts";
import { decode } from "../src/Emissions.ts";
import { open } from "../src/Epub.ts";
import { writeReadingCopy } from "../src/Overlay.ts";
import { mark } from "../src/Sentences.ts";
import { spoken } from "../src/Spoken.ts";

const [emissionsPath, epubPath, out] = process.argv.slice(2);

env.cacheDir = process.env.PROSODY_ALIGNER_MODELS ?? "";
const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
const cache = new Map<string, Array<number>>();
const piecesOf = (word: string) => {
	let pieces = cache.get(word);

	if (!pieces) {
		pieces = tokenizer.encode(` ${word}`, { add_special_tokens: false });
		cache.set(word, pieces);
	}
	return pieces;
};

const started = performance.now();
const emissions = decode(new Uint8Array(readFileSync(emissionsPath ?? "")));
const book = open(new Uint8Array(readFileSync(epubPath ?? "")));
const markups = new Map<string, string>();
const sentences = book.pages.flatMap((page) => {
	const marked = mark(
		strFromU8(book.files.get(page.path) ?? new Uint8Array()),
		"ps-"
	);
	markups.set(page.path, marked.markup);
	return marked.sentences.map((sentence) => ({ page: page.path, ...sentence }));
});
const said = sentences.map((sentence) => {
	const words = spoken(sentence.text);
	return { words, tokens: words.map(piecesOf) };
});
const marked = performance.now();
const placed = align(emissions, said);
const aligned = performance.now();
const clips = clipsOf(emissions, placed, {
	...TUNING,
	...JSON.parse(process.env.TUNING ?? "{}"),
});

const timeline = sentences.map((sentence, index) => ({
	page: sentence.page,
	id: sentence.id,
	text: sentence.text,
	words: said[index]?.words.length ?? 0,
	score: placed[index]?.score,
	start: clips[index]?.start,
	end: clips[index]?.end,
}));

writeFileSync(out ?? "timeline.json", JSON.stringify(timeline));

const placedCount = clips.filter((clip) => clip !== undefined).length;
const words = said.reduce((n, s) => n + s.words.length, 0);
const placedWords = said.reduce(
	(n, s, index) => n + (clips[index] ? s.words.length : 0),
	0
);
const audio = emissions.frames * emissions.secondsPerFrame;
const covered = clips.reduce(
	(n, clip) => n + (clip ? clip.end - clip.start : 0),
	0
);

console.log(
	`${sentences.length} sentences, ${placedCount} placed (${((100 * placedCount) / sentences.length).toFixed(1)}%), ` +
		`words ${((100 * placedWords) / words).toFixed(1)}%, audio covered ${((100 * covered) / audio).toFixed(1)}%; ` +
		`text ${((marked - started) / 1000).toFixed(1)} s, align ${((aligned - marked) / 1000).toFixed(1)} s`
);

if (process.env.AUDIO && process.env.OUT_EPUB) {
	const t = performance.now();
	writeReadingCopy(
		book,
		markups,
		timeline.map((entry) => ({
			sentence: `${entry.page}#${entry.id}`,
			state: entry.start === undefined ? "unaligned" : "aligned",
			start: entry.start,
			end: entry.end,
		})),
		[{ file: process.env.AUDIO, seconds: emissions.tracks[0] ?? 0 }],
		process.env.OUT_EPUB
	);
	console.log(
		`reading copy written in ${((performance.now() - t) / 1000).toFixed(1)} s`
	);
}

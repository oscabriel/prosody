/**
 * What happens when the audio is not in the book's order: cut a book's saved emissions into blocks,
 * play the blocks in another order, align, and count the sentences still found where they now are.
 *
 *   PROSODY_ALIGNER_MODELS=<dir> CUTS=0.3,0.6 ORDER=1,0,2 bun bench/reorder.ts <book.emissions> <book.epub>
 *
 * CUTS are fractions of the audio; ORDER is the blocks' new order. The default swaps the first two
 * of three blocks, as two audio files in the wrong order would.
 */
import { readFileSync } from "node:fs";

import { AutoTokenizer, env } from "@huggingface/transformers";
import { strFromU8 } from "fflate";

import { MODEL } from "../src/Acoustic.ts";
import { align } from "../src/Align.ts";
import { decode } from "../src/Emissions.ts";
import type { Emissions } from "../src/Emissions.ts";
import { open } from "../src/Epub.ts";
import { mark } from "../src/Sentences.ts";
import { phraseStarts, phrases } from "../src/Spoken.ts";

const [emissionsPath = "", epubPath = ""] = process.argv.slice(2);

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

const emissions = decode(new Uint8Array(readFileSync(emissionsPath)));

const book = open(new Uint8Array(readFileSync(epubPath)));

const said = book.sections
	.filter((section) => section.narrated)
	.flatMap(
		(section) =>
			mark(strFromU8(book.files.get(section.path) ?? new Uint8Array()), "ps-")
				.sentences
	)
	.map((sentence) => {
		const parts = phrases(sentence.text);
		const words = parts.flat();

		return { words, tokens: words.map(piecesOf), phrases: phraseStarts(parts) };
	});

const numbers = (text: string) => text.split(",").map(Number);

const cuts = numbers(process.env.CUTS ?? "0.3,0.6").map((fraction) =>
	Math.round(fraction * emissions.frames)
);

const edges = [0, ...cuts, emissions.frames];

const order = numbers(process.env.ORDER ?? "1,0,2");

/** Where each block of the old audio starts in the new. */
const movedTo = new Map<number, number>();

const ids = new Uint16Array(emissions.ids.length);

const scores = new Float32Array(emissions.scores.length);

const blank = new Float32Array(emissions.blank.length);

let at = 0;

for (const block of order) {
	const from = edges[block] ?? 0;
	const to = edges[block + 1] ?? 0;

	movedTo.set(block, at);
	ids.set(
		emissions.ids.subarray(from * emissions.kept, to * emissions.kept),
		at * emissions.kept
	);
	scores.set(
		emissions.scores.subarray(from * emissions.kept, to * emissions.kept),
		at * emissions.kept
	);
	blank.set(emissions.blank.subarray(from, to), at);
	at += to - from;
}

const reordered: Emissions = { ...emissions, ids, scores, blank };

/** The frame of the new audio that holds frame `frame` of the old. */
const moved = (frame: number): number => {
	const block = edges.findLastIndex((edge) => edge <= frame);

	return frame - (edges[block] ?? 0) + (movedTo.get(block) ?? 0);
};

const before = align(emissions, said);

const after = align(reordered, said);

let found = 0;

let elsewhere = 0;

let lost = 0;

for (const [index, place] of before.entries()) {
	const now = after[index];

	if (!place) {
		continue;
	}

	if (!now) {
		lost += 1;
	} else if (Math.abs(now.from - moved(place.from)) <= 12) {
		found += 1;
	} else {
		elsewhere += 1;
	}
}

const placed = before.filter((place) => place !== undefined).length;

console.log(
	`blocks in order ${order.join(",")}: of ${placed} sentences placed in the book's order, ` +
		`${found} are found where they moved to (${((100 * found) / placed).toFixed(1)}%), ` +
		`${elsewhere} are placed somewhere else, ${lost} are unaligned`
);

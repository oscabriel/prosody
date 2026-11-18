/**
 * List the sentences a timeline left unaligned although the speech model's own transcript has their
 * words in the gap between their placed neighbours: likely false skips. A proxy for a listener, from
 * the same model the aligner used, so the count is a floor and Whisper is the judge of a sample.
 *
 *   bun bench/unread.ts <book.emissions> <timeline.json> [--list]
 */
import { readFileSync } from "node:fs";

import { Schema } from "effect";

import { decode, transcriptOf } from "../src/Emissions.ts";

/** The rows of a timeline that `bench/align.ts` wrote. */
const Rows = Schema.Array(
	Schema.Struct({
		said: Schema.String,
		start: Schema.optionalKey(Schema.Finite),
		end: Schema.optionalKey(Schema.Finite),
	})
);

const [emissionsPath = "", timelinePath = "", flag] = process.argv.slice(2);

const emissions = decode(new Uint8Array(readFileSync(emissionsPath)));

const rows = Schema.decodeSync(Schema.fromJsonString(Rows))(
	readFileSync(timelinePath, "utf-8")
);

const heard = transcriptOf(emissions);

const spf = emissions.secondsPerFrame;

const key = (word: string) => word.replaceAll("'", "");

let at = 0;

let suspects = 0;

let unplaced = 0;

const lines: Array<string> = [];

for (let index = 0; index < rows.length; index += 1) {
	const row = rows[index];

	if (!row || row.start !== undefined) {
		continue;
	}

	unplaced += 1;
	// The gap between the placed sentences on either side.
	let before = index - 1;

	while (before >= 0 && rows[before]?.start === undefined) {
		before -= 1;
	}

	let after = index + 1;

	while (after < rows.length && rows[after]?.start === undefined) {
		after += 1;
	}

	const from = rows[before]?.end ?? 0;
	const to = rows[after]?.start ?? emissions.frames * spf;

	while (at > 0 && (heard[at]?.from ?? 0) * spf > from - 0.3) {
		at -= 1;
	}

	while (at < heard.length && (heard[at]?.from ?? 0) * spf < from - 0.3) {
		at += 1;
	}

	const inGap: Array<string> = [];

	for (
		let h = at;
		h < heard.length && (heard[h]?.from ?? 0) * spf < to + 0.3;
		h += 1
	) {
		inGap.push(key(heard[h]?.word ?? ""));
	}

	const said = row.said.split(" ").filter((word) => word !== "");
	const found = said.filter((word) => inGap.includes(key(word))).length;

	if (said.length > 0 && found / said.length >= 0.75 && to - from > 0.2) {
		suspects += 1;
		lines.push(
			`${from.toFixed(2)}-${to.toFixed(2)} [${said.join(" ")}] heard [${inGap.join(" ").slice(0, 120)}]`
		);
	}
}

console.log(
	`${unplaced} unaligned, ${suspects} of them with their words heard in the gap`
);

if (flag === "--list") {
	console.log(lines.join("\n"));
}

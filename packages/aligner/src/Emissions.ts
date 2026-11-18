import { Schema } from "effect";

/**
 * What the speech model heard, frame by frame: for every 80 ms of audio, how likely each token was.
 *
 * The model scores 1,024 tokens and a blank for every frame. Kept whole, 20 hours would be 3.7 GB,
 * so each frame keeps its best few tokens and the blank. A token outside a frame's best few scores
 * a little under the worst one kept, which is all the alignment needs to know: it was not heard.
 */
export interface Emissions {
	readonly frames: number;
	readonly secondsPerFrame: number;
	/** Tokens kept per frame, best first. */
	readonly kept: number;
	/** `frames * kept` token ids. */
	readonly ids: Uint16Array;
	/** `frames * kept` log-probabilities, matching `ids`. */
	readonly scores: Float32Array;
	/** The blank's log-probability, per frame. */
	readonly blank: Float32Array;
	/** The audio's loudness in decibels, every 10 ms, for finding where speech stops. */
	readonly loudness: Float32Array;
	readonly secondsPerLoudness: number;
	/** Each audio file's length in seconds, in play order: the book's time is theirs end to end. */
	readonly tracks: ReadonlyArray<number>;
	/** The model's tokens, by id. The blank is not among them. */
	readonly vocabulary: ReadonlyArray<string>;
}

/** How far under a frame's worst kept score an unkept token sits. */
const UNKEPT = 2;

/** A token's log-probability in a frame. */
export const scoreOf = (
	emissions: Emissions,
	frame: number,
	token: number
): number => {
	const from = frame * emissions.kept;

	for (let index = from; index < from + emissions.kept; index += 1) {
		if (emissions.ids[index] === token) {
			return emissions.scores[index] ?? -Infinity;
		}
	}

	return (emissions.scores[from + emissions.kept - 1] ?? -Infinity) - UNKEPT;
};

/** The frame's best token, or -1 when the blank beats it. */
export const bestOf = (emissions: Emissions, frame: number): number => {
	const from = frame * emissions.kept;

	return (emissions.scores[from] ?? -Infinity) >
		(emissions.blank[frame] ?? -Infinity)
		? (emissions.ids[from] ?? -1)
		: -1;
};

/** One word the model heard on its own, with the frames it spans. */
export interface Heard {
	readonly word: string;
	readonly from: number;
	readonly to: number;
}

/**
 * The model's own transcript: each frame's best token, repeats and blanks collapsed, joined into
 * words. A token that starts with "▁" starts a word.
 */
export const transcriptOf = (emissions: Emissions): Array<Heard> => {
	const words: Array<Heard> = [];
	let word = "";
	let from = 0;
	let to = 0;
	let previous = -1;

	for (let frame = 0; frame < emissions.frames; frame += 1) {
		const token = bestOf(emissions, frame);

		if (token !== -1 && token !== previous) {
			const piece = emissions.vocabulary[token] ?? "";

			if (piece.startsWith("▁")) {
				if (word !== "") {
					words.push({ word, from, to });
				}

				word = piece.slice(1);
				from = frame;
			} else {
				word += piece;
			}

			to = frame;
		}

		previous = token;
	}

	if (word !== "") {
		words.push({ word, from, to });
	}

	return words;
};

const MAGIC = "PRSE";

/** The JSON header `encode` writes ahead of the arrays. */
const Header = Schema.Struct({
	frames: Schema.Finite,
	secondsPerFrame: Schema.Finite,
	kept: Schema.Finite,
	loudness: Schema.Finite,
	secondsPerLoudness: Schema.Finite,
	tracks: Schema.Array(Schema.Finite),
	vocabulary: Schema.Array(Schema.String),
});

const decodeHeader = Schema.decodeUnknownSync(Schema.fromJsonString(Header));

/** Emissions as one file: a magic word, a JSON header's length and the header, then the arrays. */
export const encode = (emissions: Emissions): Uint8Array => {
	const header = new TextEncoder().encode(
		JSON.stringify({
			frames: emissions.frames,
			secondsPerFrame: emissions.secondsPerFrame,
			kept: emissions.kept,
			loudness: emissions.loudness.length,
			secondsPerLoudness: emissions.secondsPerLoudness,
			tracks: emissions.tracks,
			vocabulary: emissions.vocabulary,
		})
	);

	// Each array starts on a multiple of four bytes, so it can be read in place.
	const headerEnd = Math.ceil((8 + header.length) / 4) * 4;
	const idsBytes = Math.ceil((emissions.ids.length * 2) / 4) * 4;

	const total =
		headerEnd +
		idsBytes +
		(emissions.scores.length +
			emissions.blank.length +
			emissions.loudness.length) *
			4;

	const out = new Uint8Array(total);
	const view = new DataView(out.buffer);

	out.set(new TextEncoder().encode(MAGIC), 0);
	view.setUint32(4, header.length, true);
	out.set(header, 8);

	let at = headerEnd;
	out.set(
		new Uint8Array(
			emissions.ids.buffer,
			emissions.ids.byteOffset,
			emissions.ids.byteLength
		),
		at
	);
	at += idsBytes;

	for (const array of [emissions.scores, emissions.blank, emissions.loudness]) {
		out.set(
			new Uint8Array(array.buffer, array.byteOffset, array.byteLength),
			at
		);
		at += array.byteLength;
	}

	return out;
};

/** Read back what `encode` wrote. */
export const decode = (bytes: Uint8Array): Emissions => {
	const magic = new TextDecoder().decode(bytes.subarray(0, 4));

	if (magic !== MAGIC) {
		throw new Error("not an emissions file");
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const length = view.getUint32(4, true);

	const header = decodeHeader(
		new TextDecoder().decode(bytes.subarray(8, 8 + length))
	);

	// A copy, so the arrays start at offsets this function controls.
	const copy = new Uint8Array(bytes);
	let at = Math.ceil((8 + length) / 4) * 4;
	const cells = header.frames * header.kept;
	const ids = new Uint16Array(copy.buffer, at, cells);
	at += Math.ceil((cells * 2) / 4) * 4;
	const scores = new Float32Array(copy.buffer, at, cells);
	at += cells * 4;
	const blank = new Float32Array(copy.buffer, at, header.frames);
	at += header.frames * 4;
	const loudness = new Float32Array(copy.buffer, at, header.loudness);

	return {
		frames: header.frames,
		secondsPerFrame: header.secondsPerFrame,
		kept: header.kept,
		ids,
		scores,
		blank,
		loudness,
		secondsPerLoudness: header.secondsPerLoudness,
		tracks: header.tracks,
		vocabulary: header.vocabulary,
	};
};

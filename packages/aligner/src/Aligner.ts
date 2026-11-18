import { Context, Effect, FileSystem, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { strFromU8 } from "fflate";

import type { ListenFailed } from "./Acoustic.ts";
import { Acoustic } from "./Acoustic.ts";
import { align } from "./Align.ts";
import { Audio, isDecodable } from "./Audio.ts";
import { clipsOf } from "./Boundaries.ts";
import { decode, encode } from "./Emissions.ts";
import { open } from "./Epub.ts";
import type { Entry } from "./Overlay.ts";
import { writeReadingCopy } from "./Overlay.ts";
import { mark } from "./Sentences.ts";
import { spoken } from "./Spoken.ts";
import { SpotCheck } from "./SpotCheck.ts";
import type { CheckFailed } from "./SpotCheck.ts";

/** One pair to align, on local disk, and where its results go. */
export interface Pair {
	/** The audio files, in play order. */
	readonly audio: ReadonlyArray<string>;
	readonly epub: string;
	/** The reading copy to write. */
	readonly copy: string;
	/** The timeline to write, as JSON. */
	readonly timeline: string;
	/** Where to keep what the speech model heard, so a retry need not listen again. */
	readonly emissions?: string;
}

/** A finished alignment: how many sentences the book has, and every one's place. */
export interface Aligned {
	readonly sentences: number;
	readonly aligned: number;
	readonly entries: ReadonlyArray<Entry>;
	/** How many aligned sentences the spot check listened to, and how many it heard right. */
	readonly checked: number;
	readonly heard: number;
}

/** Audio ffmpeg cannot decode whole. Spike 1 found xHE-AAC loses frames without an error. */
export class UndecodableAudio extends Schema.TaggedError<UndecodableAudio>()(
	"UndecodableAudio",
	{ file: Schema.String, format: Schema.String }
) {}

export class UnreadableEpub extends Schema.TaggedError<UnreadableEpub>()(
	"UnreadableEpub",
	{ reason: Schema.String }
) {}

export class CopyFailed extends Schema.TaggedError<CopyFailed>()("CopyFailed", {
	reason: Schema.String,
}) {}

/** The text and the audio share nothing the aligner could find. */
export class NothingAligned extends Schema.TaggedError<NothingAligned>()(
	"NothingAligned",
	{}
) {}

export type AlignFailed =
	| UndecodableAudio
	| UnreadableEpub
	| CopyFailed
	| NothingAligned
	| ListenFailed
	| CheckFailed
	| PlatformError.PlatformError;

/**
 * Aligns a book's text with its audio and writes its reading copy: every sentence of the EPUB is
 * marked, the speech model listens to the audio, each sentence is found in what it heard or left
 * unaligned, and the EPUB is written back with media overlays and the audio inside.
 */
export class Aligner extends Context.Service<
	Aligner,
	{
		readonly align: (pair: Pair) => Effect.Effect<Aligned, AlignFailed>;
	}
>()("@prosody/aligner/Aligner", {
	make: Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const audio = yield* Audio;
		const acoustic = yield* Acoustic;
		const spotCheck = yield* SpotCheck;

		/** What the model heard: from the saved file if there is one, or by listening and saving. */
		const emissionsOf = Effect.fnUntraced(function* (pair: Pair) {
			const saved = pair.emissions;

			if (saved !== undefined && (yield* fs.exists(saved))) {
				const bytes = yield* fs.readFile(saved);

				// A file that does not decode is heard again and replaced.
				const read = yield* Effect.try(() => decode(bytes)).pipe(Effect.option);

				if (Option.isSome(read)) {
					return read.value;
				}
			}

			const heard = yield* acoustic.listen(pair.audio);

			if (saved !== undefined) {
				yield* fs.writeFile(saved, encode(heard));
			}

			return heard;
		});

		const alignPair = Effect.fn("Aligner.align")(function* (pair: Pair) {
			for (const file of pair.audio) {
				const probed = yield* audio.probe(file);

				if (!isDecodable(probed)) {
					return yield* new UndecodableAudio({
						file,
						format: probed.profile === "" ? probed.codec : probed.profile,
					});
				}
			}

			const bytes = yield* fs.readFile(pair.epub);

			const book = yield* Effect.try({
				try: () => open(bytes),
				catch: (error) => new UnreadableEpub({ reason: String(error) }),
			});

			const markups = new Map<string, string>();

			const sentences = book.pages
				.filter((page) => page.narrated)
				.flatMap((page) => {
					const marked = mark(
						strFromU8(book.files.get(page.path) ?? new Uint8Array()),
						"ps-"
					);

					markups.set(page.path, marked.markup);

					return marked.sentences.map((sentence) => ({
						key: `${page.path}#${sentence.id}`,
						text: sentence.text,
					}));
				});

			const said = yield* Effect.forEach(sentences, (sentence) => {
				const words = spoken(sentence.text);

				return Effect.map(acoustic.tokensOf(words), (tokens) => ({
					words,
					tokens,
				}));
			});

			const emissions = yield* emissionsOf(pair);
			const clips = clipsOf(emissions, align(emissions, said));

			const entries: Array<Entry> = sentences.map((sentence, index) => {
				const clip = clips[index];

				return clip === undefined
					? { sentence: sentence.key, state: "unaligned" }
					: {
							sentence: sentence.key,
							state: "aligned",
							start: Math.round(clip.start * 1000) / 1000,
							end: Math.round(clip.end * 1000) / 1000,
						};
			});

			const aligned = entries.filter(
				(entry) => entry.state === "aligned"
			).length;

			if (aligned === 0) {
				return yield* new NothingAligned();
			}

			yield* Effect.try({
				try: () => {
					writeReadingCopy(
						book,
						markups,
						entries,
						pair.audio.map((file, index) => ({
							file,
							seconds: emissions.tracks[index] ?? 0,
						})),
						pair.copy
					);
				},
				catch: (error) => new CopyFailed({ reason: String(error) }),
			});

			yield* fs.writeFileString(pair.timeline, JSON.stringify(entries));

			// The aligner finishes cleanly even when it is wrong, so listen before believing it.
			const offsets: Array<number> = [];
			let offset = 0;

			for (const seconds of emissions.tracks) {
				offsets.push(offset);
				offset += seconds;
			}

			const sightings = entries.flatMap((entry, index) => {
				if (entry.start === undefined || entry.end === undefined) {
					return [];
				}

				const track = offsets.findLastIndex((at) => at <= (entry.start ?? 0));
				const at = offsets[track] ?? 0;

				return [
					{
						text: sentences[index]?.text ?? "",
						file: pair.audio[track] ?? "",
						begin: entry.start - at,
						end: entry.end - at,
					},
				];
			});

			const { checked, heard } = yield* spotCheck.listen(sightings);

			return { sentences: entries.length, aligned, entries, checked, heard };
		});

		return { align: alignPair };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make).pipe(
		Layer.provide(Layer.mergeAll(Acoustic.layer, SpotCheck.layer)),
		Layer.provideMerge(Audio.layer)
	);
}

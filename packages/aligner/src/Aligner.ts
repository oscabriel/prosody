import {
	Context,
	Effect,
	FileSystem,
	Layer,
	Option,
	Path,
	Schema,
} from "effect";
import type { PlatformError } from "effect";

import type { ListenFailed } from "./Acoustic.ts";
import { Acoustic } from "./Acoustic.ts";
import { align } from "./Align.ts";
import { Audio, isDecodable } from "./Audio.ts";
import type { DecodeFailed } from "./Audio.ts";
import { clipsOf } from "./Boundaries.ts";
import { decode, encode } from "./Emissions.ts";
import { open } from "./Epub.ts";
import type { Book } from "./Epub.ts";
import { markSections } from "./MarkedSections.ts";
import type { TitledSection } from "./MarkedSections.ts";
import type { Entry } from "./Overlay.ts";
import { writeReadingCopy } from "./Overlay.ts";
import { phraseStarts, phrases } from "./Spoken.ts";
import { SpotCheck } from "./SpotCheck.ts";
import type { CheckFailed } from "./SpotCheck.ts";

export interface Pair {
	readonly audio: ReadonlyArray<string>;
	readonly epub: string;
	readonly copy: string;
	readonly timeline: string;
	readonly emissions?: string;
	readonly text?: string;
}

export interface Marked {
	readonly sentences: number;
	readonly sections: ReadonlyArray<TitledSection>;
	readonly cover: string | undefined;
}

export interface Aligned extends Marked {
	readonly aligned: number;
	readonly entries: ReadonlyArray<Entry>;
	readonly checked: number;
	readonly heard: number;
}

export class UndecodableAudio extends Schema.TaggedError<UndecodableAudio>()(
	"UndecodableAudio",
	{ file: Schema.String, format: Schema.String }
) {}

export class AudioCutShort extends Schema.TaggedError<AudioCutShort>()(
	"AudioCutShort",
	{ file: Schema.String, decoded: Schema.Finite, stated: Schema.Finite }
) {}

export class UnreadableEpub extends Schema.TaggedError<UnreadableEpub>()(
	"UnreadableEpub",
	{ reason: Schema.String }
) {}

export class CopyFailed extends Schema.TaggedError<CopyFailed>()("CopyFailed", {
	reason: Schema.String,
}) {}

const timelineJson = (entries: ReadonlyArray<Entry>) =>
	Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(entries).pipe(
		Effect.mapError((failed) => new CopyFailed({ reason: failed.message }))
	);

export class NothingAligned extends Schema.TaggedError<NothingAligned>()(
	"NothingAligned",
	{}
) {}

export type AlignFailed =
	| UndecodableAudio
	| AudioCutShort
	| DecodeFailed
	| UnreadableEpub
	| CopyFailed
	| NothingAligned
	| ListenFailed
	| CheckFailed
	| PlatformError.PlatformError;

export const wrongLength = (
	decoded: ReadonlyArray<number>,
	stated: ReadonlyArray<number>
): number | undefined => {
	const wrong = stated.findIndex((seconds, index) => {
		const heard = decoded[index];

		return (
			heard === undefined ||
			(seconds > 0 && Math.abs(heard - seconds) > 1 + seconds / 1000)
		);
	});

	return wrong === -1 ? undefined : wrong;
};

export class Aligner extends Context.Service<
	Aligner,
	{
		readonly align: (pair: Pair) => Effect.Effect<Aligned, AlignFailed>;
		readonly mark: (
			epub: string,
			text: string
		) => Effect.Effect<Marked, UnreadableEpub | PlatformError.PlatformError>;
	}
>()("@prosody/aligner/Aligner", {
	make: Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const audio = yield* Audio;
		const acoustic = yield* Acoustic;
		const spotCheck = yield* SpotCheck;

		const emissionsOf = Effect.fnUntraced(function* (
			pair: Pair,
			stated: ReadonlyArray<number>
		) {
			const saved = pair.emissions;

			if (saved !== undefined && (yield* fs.exists(saved))) {
				const bytes = yield* fs.readFile(saved);

				const read = Option.liftThrowable(decode)(bytes);

				if (
					Option.isSome(read) &&
					wrongLength(read.value.tracks, stated) === undefined
				) {
					return read.value;
				}
			}

			const heard = yield* acoustic.listen(pair.audio);
			const wrong = wrongLength(heard.tracks, stated);

			if (wrong !== undefined) {
				return yield* new AudioCutShort({
					file: pair.audio[wrong] ?? "",
					decoded: heard.tracks[wrong] ?? 0,
					stated: stated[wrong] ?? 0,
				});
			}

			if (saved !== undefined) {
				yield* fs.writeFile(saved, encode(heard));
			}

			return heard;
		});

		const writeText = Effect.fnUntraced(function* (
			book: Book,
			markups: ReadonlyMap<string, string>,
			folder: string
		) {
			for (const [name, data] of book.files) {
				const target = path.join(folder, name);

				if (name.endsWith("/") || !target.startsWith(`${folder}${path.sep}`)) {
					continue;
				}

				yield* fs.makeDirectory(path.dirname(target), { recursive: true });

				const marked = markups.get(name);

				yield* marked === undefined
					? fs.writeFile(target, data)
					: fs.writeFileString(target, marked);
			}
		});

		const openEpub = Effect.fnUntraced(function* (epub: string) {
			const bytes = yield* fs.readFile(epub);

			return yield* Effect.try({
				try: () => open(bytes),
				catch: (error) => new UnreadableEpub({ reason: String(error) }),
			});
		});

		const markText = Effect.fn("Aligner.mark")(function* (
			epub: string,
			text: string
		) {
			const book = yield* openEpub(epub);
			const { markups, sections, sentences } = markSections(book);

			yield* writeText(book, markups, text);

			return { sentences: sentences.length, sections, cover: book.cover };
		});

		const alignPair = Effect.fn("Aligner.align")(function* (pair: Pair) {
			const stated: Array<number> = [];

			for (const file of pair.audio) {
				const probed = yield* audio.probe(file);

				stated.push(probed.seconds);

				if (!isDecodable(probed)) {
					return yield* new UndecodableAudio({
						file,
						format: probed.profile === "" ? probed.codec : probed.profile,
					});
				}
			}

			const book = yield* openEpub(pair.epub);
			const { markups, sections, sentences } = markSections(book);

			const said = yield* Effect.forEach(
				sentences,
				(sentence) => {
					const parts = phrases(sentence.text);
					const words = parts.flat();

					return Effect.map(acoustic.tokensOf(words), (tokens) => ({
						words,
						tokens,
						phrases: phraseStarts(parts),
					}));
				},
				{ concurrency: 1 }
			);

			const emissions = yield* emissionsOf(pair, stated);
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

			yield* fs.writeFileString(pair.timeline, yield* timelineJson(entries));

			if (pair.text !== undefined) {
				yield* writeText(book, markups, pair.text);
			}

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

			return {
				sentences: entries.length,
				aligned,
				entries,
				sections,
				cover: book.cover,
				checked,
				heard,
			};
		});

		return { align: alignPair, mark: markText };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make).pipe(
		Layer.provide(Layer.mergeAll(Acoustic.layer, SpotCheck.layer)),
		Layer.provideMerge(Audio.layer)
	);
}

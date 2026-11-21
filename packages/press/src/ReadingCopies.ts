import { Aligner } from "@prosody/aligner/Aligner";
import type { AlignFailed } from "@prosody/aligner/Aligner";
import { Audio } from "@prosody/aligner/Audio";
import type { AlignRequest } from "@prosody/domain/Narration/Aligner.external";
import type { CopyRequest } from "@prosody/domain/Reading/Copier.external";
import { Contents } from "@prosody/domain/Reading/Copy";
import {
	Array,
	Context,
	Effect,
	FileSystem,
	Layer,
	Match,
	Option,
	Path,
	Schema,
} from "effect";

import { Covers } from "./Covers.ts";
import { Pages } from "./Pages.ts";

export const LIBRARY = "/library";

export const COPIES = "/copies";

const encodeContents = Schema.encodeEffect(Schema.fromJsonString(Contents));

export class Unmade extends Schema.TaggedError<Unmade>()("Unmade", {
	reason: Schema.String,
}) {}

export interface Aligned {
	readonly sentences: number;
	readonly matched: number;
	readonly checked: number;
	readonly heard: number;
}

export interface Copied {
	readonly chapters: number;
}

const reasonOf = (error: AlignFailed | Schema.SchemaError): string =>
	Match.valueTags(error, {
		UndecodableAudio: (failed) =>
			`its audio is ${failed.format}, which ffmpeg can't decode whole`,
		AudioCutShort: (failed) =>
			`ffmpeg decoded ${Math.round(failed.decoded)} of its audio's ${Math.round(failed.stated)} seconds`,
		DecodeFailed: (failed) =>
			`ffmpeg stopped decoding its audio (exit code ${failed.exitCode})`,
		UnreadableEpub: (failed) => `its text could not be read: ${failed.reason}`,
		NothingAligned: () => "no sentence was found in the audio",
		CopyFailed: (failed) =>
			`the reading copy could not be written: ${failed.reason}`,
		ListenFailed: (failed) => failed.reason,
		CheckFailed: (failed) => failed.reason,
		PlatformError: (failed) => failed.message,
		SchemaError: () => "its chapters could not be read",
	});

export class ReadingCopies extends Context.Service<
	ReadingCopies,
	{
		readonly make: (request: AlignRequest) => Effect.Effect<Aligned, Unmade>;
		readonly copy: (request: CopyRequest) => Effect.Effect<Copied, Unmade>;
	}
>()("@prosody/press/ReadingCopies", {
	make: Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const aligner = yield* Aligner;
		const audioFiles = yield* Audio;
		const covers = yield* Covers;
		const pdfs = yield* Pages;

		const freshFolder = Effect.fnUntraced(function* (
			work: string,
			keep: (name: string) => boolean
		) {
			const folder = path.join(COPIES, work);

			yield* fs.makeDirectory(folder, { recursive: true });

			for (const name of yield* fs.readDirectory(folder)) {
				if (!keep(name)) {
					yield* fs.remove(path.join(folder, name), {
						recursive: true,
						force: true,
					});
				}
			}

			return folder;
		});

		const coverOf = Effect.fnUntraced(function* (
			folder: string,
			picture: string | undefined,
			audio: string | undefined
		) {
			const fromText =
				picture === undefined
					? Option.none()
					: yield* covers.make(path.join(folder, "text", picture), folder);

			if (Option.isSome(fromText) || audio === undefined) {
				return fromText;
			}

			return yield* covers.make(audio, folder);
		});

		const finish = (folder: string, contents: Contents) =>
			encodeContents(Contents.make(contents)).pipe(
				Effect.mapError(
					(failed) =>
						new Unmade({
							reason: `its contents could not be written: ${failed.message}`,
						})
				),
				Effect.flatMap((json) =>
					fs.writeFileString(path.join(folder, "contents.json"), json)
				)
			);

		const make = Effect.fn("ReadingCopies.make")(
			function* (request: AlignRequest) {
				const folder = path.join(COPIES, request.work);
				const audioFolder = path.join(folder, "audio");

				const source = path.join(
					LIBRARY,
					"audiobooks",
					request.shelfmark,
					request.audio
				);

				const audio = path.join(audioFolder, request.audio);
				const text = path.join(folder, "source.epub");
				const { size } = yield* fs.stat(source);
				const heard = `heard-${size}.emissions`;

				yield* freshFolder(request.work, (name) => name === heard);
				yield* fs.makeDirectory(audioFolder, { recursive: true });
				yield* fs.copyFile(source, audio);
				yield* fs.copyFile(
					path.join(LIBRARY, "ebooks", request.shelfmark, request.text),
					text
				);

				const aligned = yield* aligner
					.align({
						audio: [audio],
						epub: text,
						copy: path.join(folder, `${request.work}.epub`),
						timeline: path.join(folder, "timeline.json"),
						emissions: path.join(folder, heard),
						text: path.join(folder, "text"),
					})
					.pipe(
						Effect.mapError((error) => new Unmade({ reason: reasonOf(error) }))
					);

				yield* fs.remove(text, { force: true });

				if (aligned.checked === 0 || 4 * aligned.heard < 3 * aligned.checked) {
					return yield* new Unmade({
						reason:
							aligned.checked === 0
								? "no sentence was long enough to check"
								: `the spot check heard the right words in only ${aligned.heard} of ${aligned.checked} sentences`,
					});
				}

				const cover = yield* coverOf(folder, aligned.cover, audio);

				yield* finish(folder, {
					audio: request.audio,
					sections: aligned.sections,
					chapters: [],
					cover: Option.getOrNull(cover),
					pictures: [],
					headings: [],
				});

				return {
					sentences: aligned.sentences,
					matched: aligned.aligned,
					checked: aligned.checked,
					heard: aligned.heard,
				};
			},
			Effect.catchTags({
				PlatformError: (error) =>
					Effect.fail(new Unmade({ reason: error.message })),
			})
		);

		const copyText = Effect.fnUntraced(function* (
			folder: string,
			source: string
		) {
			const epub = path.join(folder, "source.epub");

			yield* fs.copyFile(source, epub);

			const marked = yield* aligner.mark(epub, path.join(folder, "text"));

			yield* fs.remove(epub, { force: true });

			if (marked.sections.length === 0) {
				return yield* new Unmade({
					reason: "its text has no sentences to read",
				});
			}

			const cover = yield* coverOf(folder, marked.cover, undefined);

			yield* finish(folder, {
				audio: null,
				sections: marked.sections,
				chapters: [],
				cover: Option.getOrNull(cover),
				pictures: [],
				headings: [],
			});

			return { chapters: marked.sections.length };
		});

		const copyAudio = Effect.fnUntraced(function* (
			folder: string,
			source: string,
			file: string
		) {
			const audio = path.join(folder, "audio", file);

			yield* fs.makeDirectory(path.dirname(audio), { recursive: true });
			yield* fs.copyFile(source, audio);

			const marked = yield* audioFiles.chapters(audio);

			const chapters =
				marked.length > 0
					? marked
					: [
							{
								title: "",
								start: 0,
								end: (yield* audioFiles.probe(audio)).seconds,
							},
						];

			const cover = yield* covers.make(audio, folder);

			yield* finish(folder, {
				audio: file,
				sections: [],
				chapters,
				cover: Option.getOrNull(cover),
				pictures: [],
				headings: [],
			});

			return { chapters: chapters.length };
		});

		const copyPages = Effect.fnUntraced(function* (
			folder: string,
			source: string
		) {
			const pdf = path.join(folder, "source.pdf");
			const drawn = path.join(folder, "pictures");

			yield* fs.copyFile(source, pdf);

			const [pictures, headings] = yield* Effect.all(
				[pdfs.draw(pdf, drawn), pdfs.headings(pdf)],
				{ concurrency: 1 }
			).pipe(Effect.ensuring(Effect.ignore(fs.remove(pdf, { force: true }))));

			const cover = yield* covers.make(
				path.join(drawn, Array.headNonEmpty(pictures)),
				folder
			);

			yield* finish(folder, {
				audio: null,
				sections: [],
				chapters: [],
				cover: Option.getOrNull(cover),
				pictures,
				headings,
			});

			return { chapters: headings.length };
		});

		const copy = Effect.fn("ReadingCopies.copy")(
			function* (request: CopyRequest) {
				const half = request.kind === "audio" ? "audiobooks" : "ebooks";

				const source = path.join(
					LIBRARY,
					half,
					request.shelfmark,
					request.file
				);

				const folder = yield* freshFolder(request.work, (name) =>
					name.startsWith("heard-")
				);

				return yield* Match.value(request.kind).pipe(
					Match.when("text", () => copyText(folder, source)),
					Match.when("pages", () => copyPages(folder, source)),
					Match.when("audio", () => copyAudio(folder, source, request.file)),
					Match.exhaustive
				);
			},
			Effect.catchTags({
				PlatformError: (error) =>
					Effect.fail(new Unmade({ reason: error.message })),
				UnreadableEpub: (error) =>
					Effect.fail(new Unmade({ reason: reasonOf(error) })),
				SchemaError: (error) =>
					Effect.fail(new Unmade({ reason: reasonOf(error) })),
				Undrawable: ({ reason }) =>
					Effect.fail(
						new Unmade({ reason: `its pages could not be drawn: ${reason}` })
					),
			})
		);

		return { make, copy };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make).pipe(
		Layer.provide(Layer.mergeAll(Aligner.layer, Covers.layer, Pages.layer))
	);
}

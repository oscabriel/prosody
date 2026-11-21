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

/** Where the press's container sees the library and the reading copies. */
export const LIBRARY = "/library";

export const COPIES = "/copies";

const encodeContents = Schema.encodeEffect(Schema.fromJsonString(Contents));

/** A reading copy the press could not make, and why, in words for the shelf. */
export class Unmade extends Schema.TaggedError<Unmade>()("Unmade", {
	reason: Schema.String,
}) {}

/** A finished reading copy: how much of the text was found in the audio, and what the spot check heard. */
export interface Aligned {
	readonly sentences: number;
	readonly matched: number;
	readonly checked: number;
	readonly heard: number;
}

/** A finished copy of one edition: how many chapters the reading room lists. */
export interface Copied {
	readonly chapters: number;
}

/** What went wrong, in words for the shelf. */
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

/**
 * Makes reading copies on the host's own disk, one at a time. For a pair, both files are copied out
 * of the library, and the aligner marks every sentence, finds it in the audio, writes the copy and
 * listens to a spread of sentences with a second speech model. A text alone is marked the same way;
 * an audio alone is copied, with the chapters its file marks; a book's pages are drawn, one picture
 * each.
 *
 *   /copies/<work>/<work>.epub          a pair's reading copy: marked text, its overlays, the audio
 *   /copies/<work>/audio/               the audio, kept to play from
 *   /copies/<work>/timeline.json        a pair's every sentence's place in the audio, or none
 *   /copies/<work>/text/                the copy's pages, unpacked, for the reading room
 *   /copies/<work>/pictures/            a copy of a PDF: a picture of each of its pages
 *   /copies/<work>/cover.jpg            the cover, when the book has a picture
 *   /copies/<work>/contents.json        the audio to play, the pages to read, the chapters to hear
 *                                       and the cover; written last, so a copy that has one is
 *                                       complete
 *   /copies/<work>/heard-<size>.emissions
 *                                       what the speech model heard, kept so a retry need not
 *                                       listen again; named by the audio's size, so new audio is
 *                                       heard afresh
 */
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

		/**
		 * A work's copy folder, emptied for a new try. What the speech model heard of the audio is
		 * kept when `keep` says so.
		 */
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

		/** The cover from the text's picture, or else from the audio's. */
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

		/** Write a copy's contents, last of all. */
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

				// A fresh folder for the try, keeping what the model heard of this same audio.
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

				// Three in four heard right. Spike 1's good books scored 37 to 40 of 40; the bad one 0.
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
					pages: aligned.pages,
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
			// A file that can't be read or written ends the try too, with the platform's words.
			Effect.catchTags({
				PlatformError: (error) =>
					Effect.fail(new Unmade({ reason: error.message })),
			})
		);

		/** A text alone: its pages marked, as a pair's are, with no audio to find them in. */
		const copyText = Effect.fnUntraced(function* (
			folder: string,
			source: string
		) {
			const epub = path.join(folder, "source.epub");

			yield* fs.copyFile(source, epub);

			const marked = yield* aligner.mark(epub, path.join(folder, "text"));

			yield* fs.remove(epub, { force: true });

			// A book of pictures, or scanned pages, has nothing to read in the room.
			if (marked.pages.length === 0) {
				return yield* new Unmade({
					reason: "its text has no sentences to read",
				});
			}

			const cover = yield* coverOf(folder, marked.cover, undefined);

			yield* finish(folder, {
				audio: null,
				pages: marked.pages,
				chapters: [],
				cover: Option.getOrNull(cover),
				pictures: [],
				headings: [],
			});

			return { chapters: marked.pages.length };
		});

		/**
		 * An audio alone, with the chapters its file marks. A file that marks none is one chapter,
		 * as long as the file says it is.
		 */
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
				pages: [],
				chapters,
				cover: Option.getOrNull(cover),
				pictures: [],
				headings: [],
			});

			return { chapters: chapters.length };
		});

		/** A book's pages: a picture of each, the chapters its outline lists, and the first as its cover. */
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
				pages: [],
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

				// What the model heard of any audio is kept, should the work be paired later.
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

import { Aligner } from "@prosody/aligner/Aligner";
import type { AlignFailed } from "@prosody/aligner/Aligner";
import type { AlignRequest } from "@prosody/domain/Narration/Aligner.external";
import { Contents } from "@prosody/domain/Reading/Copy";
import {
	Context,
	Effect,
	FileSystem,
	Layer,
	Match,
	Path,
	Schema,
} from "effect";

/** Where the press's container sees the library (read-only) and the reading copies (on the host's own disk). */
export const LIBRARY = "/library";

export const COPIES = "/copies";

/** A pair the press could not make a reading copy of, and why, in words for the shelf. */
export class Unaligned extends Schema.TaggedError<Unaligned>()("Unaligned", {
	reason: Schema.String,
}) {}

/** A finished reading copy: how much of the text was found in the audio, and what the spot check heard. */
export interface Aligned {
	readonly sentences: number;
	readonly matched: number;
	readonly checked: number;
	readonly heard: number;
}

/** What went wrong, in words for the shelf. */
const reasonOf = (error: AlignFailed): string =>
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
	});

/**
 * Makes reading copies on the host's own disk, one pair at a time: both files are copied out of the library, and the
 * aligner marks every sentence, finds it in the audio, writes the copy and listens to a spread of
 * sentences with a second speech model.
 *
 *   /copies/<work>/<work>.epub          the reading copy: marked text, its overlays, and the audio
 *   /copies/<work>/audio/               the audio, kept to play from
 *   /copies/<work>/timeline.json        every sentence's place in the audio, or none
 *   /copies/<work>/text/                the copy's pages, unpacked, for the reading room
 *   /copies/<work>/contents.json        the audio to play and the pages to read; written last, so a
 *                                       copy that has one is complete
 *   /copies/<work>/heard-<size>.emissions
 *                                       what the speech model heard, kept so a retry need not
 *                                       listen again; named by the audio's size, so new audio is
 *                                       heard afresh
 */
export class ReadingCopies extends Context.Service<
	ReadingCopies,
	{
		readonly make: (request: AlignRequest) => Effect.Effect<Aligned, Unaligned>;
	}
>()("@prosody/press/ReadingCopies", {
	make: Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const aligner = yield* Aligner;

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
				yield* fs.makeDirectory(folder, { recursive: true });

				for (const name of yield* fs.readDirectory(folder)) {
					if (name !== heard) {
						yield* fs.remove(path.join(folder, name), {
							recursive: true,
							force: true,
						});
					}
				}

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
						Effect.mapError(
							(error) => new Unaligned({ reason: reasonOf(error) })
						)
					);

				yield* fs.remove(text, { force: true });

				// Three in four heard right. Spike 1's good books scored 37 to 40 of 40; the bad one 0.
				if (aligned.checked === 0 || 4 * aligned.heard < 3 * aligned.checked) {
					return yield* new Unaligned({
						reason:
							aligned.checked === 0
								? "no sentence was long enough to check"
								: `the spot check heard the right words in only ${aligned.heard} of ${aligned.checked} sentences`,
					});
				}

				yield* fs.writeFileString(
					path.join(folder, "contents.json"),
					JSON.stringify(
						Contents.make({ audio: request.audio, pages: aligned.pages })
					)
				);

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
					Effect.fail(new Unaligned({ reason: error.message })),
			})
		);

		return { make };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make).pipe(
		Layer.provide(Aligner.layer)
	);
}

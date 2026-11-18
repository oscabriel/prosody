import type { AlignRequest } from "@prosody/domain/Narration/Aligner.external";
import {
	Array,
	Context,
	Effect,
	FileSystem,
	Layer,
	Option,
	Path,
	Schema,
	Stream,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { SpotCheck } from "./SpotCheck.ts";

/** Where the press's container sees the library (read-only) and the reading copies (on the host's own disk). */
export const LIBRARY = "/library";

export const COPIES = "/copies";

/** A pair the press could not make a reading copy of, and why, in words for the shelf. */
export class Unaligned extends Schema.TaggedError<Unaligned>()("Unaligned", {
	reason: Schema.String,
}) {}

/** A finished reading copy: the aligner's counts, and what the spot check heard. */
export interface Aligned {
	readonly sentences: number;
	readonly matched: number;
	readonly checked: number;
	readonly heard: number;
}

/** The part of the aligner's `reports.json` the press reads. */
const Report = Schema.Struct({
	totals: Schema.Struct({
		sentences: Schema.Int,
		matchedSentences: Schema.Int,
	}),
});

const decodeReport = Schema.decodeUnknownEffect(Schema.fromJsonString(Report));

/** Whether ffmpeg decodes this audio whole. Spike 1 found xHE-AAC loses frames without an error. */
const isDecodable = (codec: string, profile: string) =>
	codec === "mp3" || (codec === "aac" && profile === "LC");

/**
 * Makes reading copies on the host's own disk, one pair at a time: the audio's codec is checked, both files are
 * copied out of the library, Storyteller's aligner marks every sentence and finds it in the audio, and a
 * spot check listens to a spread of sentences with a second speech model.
 *
 *   /copies/<work>/<work>.epub    the reading copy: marked text, its timeline, and the audio inside
 *   /copies/<work>/audio/         the audio, kept to play from
 *   /copies/<work>/report.json    the aligner's report
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
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
		const spotCheck = yield* SpotCheck;

		/**
		 * Run a program to its end: its exit code, and the line that says why it stopped. A Node program
		 * prints its error, then a stack trace, so the line naming the error is the one worth keeping.
		 */
		const run = (command: ChildProcess.Command) =>
			Effect.scoped(
				Effect.gen(function* () {
					const handle = yield* spawner.spawn(command);

					const lines = yield* handle.all.pipe(
						Stream.decodeText(),
						Stream.splitLines,
						Stream.runCollect
					);

					const why = Array.findLast(
						lines,
						(line) => /\w*Error\b/u.test(line) && !line.trim().startsWith("at ")
					);

					return {
						exitCode: yield* handle.exitCode,
						why: Option.getOrElse(why, () =>
							Array.last(lines).pipe(Option.getOrElse(() => ""))
						),
					};
				})
			);

		/** The first audio stream's codec and profile, as ffprobe names them. */
		const codecOf = Effect.fnUntraced(function* (audio: string) {
			const probed = yield* spawner.string(
				ChildProcess.make("ffprobe", [
					"-v",
					"error",
					"-select_streams",
					"a:0",
					"-show_entries",
					"stream=codec_name,profile",
					"-of",
					"csv=p=0",
					audio,
				])
			);

			const [codec = "", profile = ""] = probed.trim().split(",");

			return { codec, profile };
		});

		const make = Effect.fn("ReadingCopies.make")(
			function* (request: AlignRequest) {
				const folder = path.join(COPIES, request.work);
				const audioFolder = path.join(folder, "audio");
				const audio = path.join(audioFolder, request.audio);
				const text = path.join(folder, "source.epub");
				const copy = path.join(folder, `${request.work}.epub`);
				const report = path.join(folder, "report.json");

				// The format first, in the library, before copying a file that can't be aligned.
				const { codec, profile } = yield* codecOf(
					path.join(LIBRARY, "audiobooks", request.shelfmark, request.audio)
				);

				if (!isDecodable(codec, profile)) {
					return yield* new Unaligned({
						reason:
							codec === ""
								? "its audio could not be read"
								: `its audio is ${profile || codec}, which ffmpeg can't decode whole`,
					});
				}

				yield* fs.remove(folder, { recursive: true, force: true });
				yield* fs.makeDirectory(audioFolder, { recursive: true });

				yield* fs.copyFile(
					path.join(LIBRARY, "audiobooks", request.shelfmark, request.audio),
					audio
				);

				yield* fs.copyFile(
					path.join(LIBRARY, "ebooks", request.shelfmark, request.text),
					text
				);

				const aligned = yield* run(
					ChildProcess.make(
						"nice",
						[
							"-n",
							"10",
							"align",
							"--ctc",
							"--model",
							"quartznet15x5",
							"--language",
							"en",
							"--device",
							"cpu",
							"--audiobook",
							audioFolder,
							"--epub",
							text,
							// Some of the library's EPUBs are EPUB 2, and the aligner reads only EPUB 3.
							"--autoupgrade",
							"--emissions",
							path.join(folder, "emissions"),
							"--reports",
							report,
							"--output",
							copy,
							"--no-progress",
							"--log-level",
							"warn",
						],
						// The aligner's scratch files hold the audio too, so they go on the host's own disk, in the try's
						// own folder, and are removed with the rest below.
						{
							env: { STORYTELLER_SCRATCH_DIR: path.join(folder, "scratch") },
							extendEnv: true,
						}
					)
				);

				if (aligned.exitCode !== ChildProcessSpawner.ExitCode(0)) {
					return yield* new Unaligned({
						reason: `the aligner stopped: ${aligned.why.trim().slice(0, 300)}`,
					});
				}

				const { totals } = yield* fs
					.readFileString(report)
					.pipe(Effect.flatMap(decodeReport));

				// The aligner exits cleanly even when it is wrong, so listen before believing it.
				const book = path.join(folder, "book");

				yield* spawner.exitCode(
					ChildProcess.make("unzip", [
						"-q",
						"-o",
						copy,
						"-x",
						"*.m4b",
						"*.m4a",
						"*.mp3",
						"-d",
						book,
					])
				);

				const { checked, heard } = yield* spotCheck.listen(
					book,
					audio,
					path.join(folder, "check")
				);

				for (const scratch of [
					book,
					path.join(folder, "check"),
					path.join(folder, "emissions"),
					text,
					path.join(folder, "scratch"),
				]) {
					yield* fs.remove(scratch, { recursive: true, force: true });
				}

				// Three in four heard right. Spike 1's good books scored 37 to 40 of 40; the bad one 0.
				if (checked === 0 || 4 * heard < 3 * checked) {
					return yield* new Unaligned({
						reason:
							checked === 0
								? "no sentence was found in the audio"
								: `the spot check heard the right words in only ${heard} of ${checked} sentences`,
					});
				}

				return {
					sentences: totals.sentences,
					matched: totals.matchedSentences,
					checked,
					heard,
				};
			},
			// A file that can't be read or written ends the try too, with the platform's words.
			Effect.catchTags({
				PlatformError: (error) =>
					Effect.fail(new Unaligned({ reason: error.message })),
				SchemaError: () =>
					Effect.fail(
						new Unaligned({ reason: "the aligner's report could not be read" })
					),
			})
		);

		return { make };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}

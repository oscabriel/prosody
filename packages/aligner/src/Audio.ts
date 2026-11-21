import { Context, Effect, Layer, Schema, Stream } from "effect";
import type { PlatformError } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

export const SAMPLE_RATE = 16_000;

export interface Probed {
	readonly codec: string;
	readonly profile: string;
	readonly seconds: number;
}

export interface Chapter {
	readonly title: string;
	readonly start: number;
	readonly end: number;
}

const ProbedChapters = Schema.fromJsonString(
	Schema.Struct({
		chapters: Schema.Array(
			Schema.Struct({
				start_time: Schema.FiniteFromString,
				end_time: Schema.FiniteFromString,
				tags: Schema.optionalKey(
					Schema.Struct({ title: Schema.optionalKey(Schema.String) })
				),
			})
		),
	})
);

export class DecodeFailed extends Schema.TaggedError<DecodeFailed>()(
	"DecodeFailed",
	{ file: Schema.String, exitCode: Schema.Finite }
) {}

export const isDecodable = ({ codec, profile }: Probed): boolean =>
	codec === "mp3" || (codec === "aac" && profile === "LC");

export class Audio extends Context.Service<
	Audio,
	{
		readonly probe: (
			file: string
		) => Effect.Effect<Probed, PlatformError.PlatformError>;
		readonly chapters: (
			file: string
		) => Effect.Effect<
			ReadonlyArray<Chapter>,
			PlatformError.PlatformError | Schema.SchemaError
		>;
		readonly samples: (
			file: string
		) => Stream.Stream<Uint8Array, DecodeFailed | PlatformError.PlatformError>;
		readonly clip: (
			file: string,
			from: number,
			to: number
		) => Effect.Effect<
			Float32Array,
			DecodeFailed | PlatformError.PlatformError
		>;
	}
>()("@prosody/aligner/Audio", {
	make: Effect.gen(function* () {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

		const probe = Effect.fn("Audio.probe")(function* (file: string) {
			const probed = yield* spawner.string(
				ChildProcess.make("ffprobe", [
					"-v",
					"error",
					"-select_streams",
					"a:0",
					"-show_entries",
					"stream=codec_name,profile:format=duration",
					"-of",
					"csv=p=0",
					file,
				])
			);

			const [stream = "", format = ""] = probed.trim().split(/\s+/u);
			const [codec = "", profile = ""] = stream.split(",");
			const seconds = Number(format);

			return {
				codec,
				profile,
				seconds: Number.isFinite(seconds) ? seconds : 0,
			};
		});

		const chapters = Effect.fn("Audio.chapters")(function* (file: string) {
			const probed = yield* spawner.string(
				ChildProcess.make("ffprobe", [
					"-v",
					"error",
					"-show_chapters",
					"-of",
					"json",
					file,
				])
			);

			const { chapters: found } =
				yield* Schema.decodeEffect(ProbedChapters)(probed);

			return found.map((chapter) => ({
				title: chapter.tags?.title ?? "",
				start: chapter.start_time,
				end: chapter.end_time,
			}));
		});

		const decoded = (file: string, seek: ReadonlyArray<string>) =>
			Stream.scoped(
				Stream.unwrap(
					Effect.map(
						spawner.spawn(
							ChildProcess.make(
								"ffmpeg",
								[
									"-v",
									"error",
									...seek,
									"-i",
									file,
									"-vn",
									"-f",
									"f32le",
									"-ac",
									"1",
									"-ar",
									String(SAMPLE_RATE),
									"-",
								],
								{ stderr: "inherit" }
							)
						),
						(handle) =>
							Stream.concat(
								handle.stdout,
								Stream.unwrap(
									Effect.map(handle.exitCode, (exitCode) =>
										exitCode === 0
											? Stream.empty
											: Stream.fail(new DecodeFailed({ file, exitCode }))
									)
								)
							)
					)
				)
			);

		const samples = (file: string) => decoded(file, []);

		const clip = Effect.fn("Audio.clip")(function* (
			file: string,
			from: number,
			to: number
		) {
			const chunks = yield* Stream.runCollect(
				decoded(file, ["-ss", String(from), "-to", String(to)])
			);

			const length = chunks.reduce((n, chunk) => n + chunk.length, 0);
			const bytes = new Uint8Array(length - (length % 4));
			let at = 0;

			for (const chunk of chunks) {
				bytes.set(
					chunk.subarray(0, Math.min(chunk.length, bytes.length - at)),
					at
				);
				at += chunk.length;
			}

			return new Float32Array(bytes.buffer);
		});

		return { probe, chapters, samples, clip };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}

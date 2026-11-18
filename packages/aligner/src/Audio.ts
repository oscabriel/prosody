import { Context, Effect, Layer, Stream } from "effect";
import type { PlatformError } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

/** The rate the speech model listens at. */
export const SAMPLE_RATE = 16_000;

/** What ffprobe says about a file's first audio stream. */
export interface Probed {
	readonly codec: string;
	readonly profile: string;
}

/** Whether ffmpeg decodes this audio whole. Spike 1 found xHE-AAC loses frames without an error. */
export const isDecodable = ({ codec, profile }: Probed): boolean =>
	codec === "mp3" || (codec === "aac" && profile === "LC");

/**
 * Audio through ffmpeg: what a file holds, and its sound as 16 kHz mono samples. The samples come
 * as a stream of raw little-endian floats, so twenty hours never sits in memory at once.
 */
export class Audio extends Context.Service<
	Audio,
	{
		readonly probe: (
			file: string
		) => Effect.Effect<Probed, PlatformError.PlatformError>;
		readonly samples: (
			file: string
		) => Stream.Stream<Uint8Array, PlatformError.PlatformError>;
		/** The samples from `from` to `to` seconds of a file, whole. */
		readonly clip: (
			file: string,
			from: number,
			to: number
		) => Effect.Effect<Float32Array, PlatformError.PlatformError>;
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
					"stream=codec_name,profile",
					"-of",
					"csv=p=0",
					file,
				])
			);

			const [codec = "", profile = ""] = probed.trim().split(",");

			return { codec, profile };
		});

		const samples = (file: string) =>
			Stream.scoped(
				Stream.unwrap(
					Effect.map(
						spawner.spawn(
							ChildProcess.make("ffmpeg", [
								"-v",
								"error",
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
							])
						),
						(handle) => handle.stdout
					)
				)
			);

		const clip = Effect.fn("Audio.clip")(function* (
			file: string,
			from: number,
			to: number
		) {
			const chunks = yield* Stream.runCollect(
				Stream.scoped(
					Stream.unwrap(
						Effect.map(
							spawner.spawn(
								ChildProcess.make("ffmpeg", [
									"-v",
									"error",
									"-ss",
									String(from),
									"-to",
									String(to),
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
								])
							),
							(handle) => handle.stdout
						)
					)
				)
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

		return { probe, samples, clip };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}

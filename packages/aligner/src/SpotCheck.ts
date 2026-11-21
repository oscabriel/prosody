import { env, pipeline } from "@huggingface/transformers";
import { Config, Context, Effect, Layer, Schema } from "effect";
import type { PlatformError } from "effect";

import { Audio } from "./Audio.ts";
import type { DecodeFailed } from "./Audio.ts";

export const CHECK_MODEL = "onnx-community/whisper-base.en";

const CLIPS = 40;

const SHORTEST = 3;

const LONGEST = 15;

const ALIKE = 0.8;

export interface Sighting {
	readonly text: string;
	readonly file: string;
	readonly begin: number;
	readonly end: number;
}

export interface Heard {
	readonly checked: number;
	readonly heard: number;
}

export class CheckFailed extends Schema.TaggedError<CheckFailed>()(
	"CheckFailed",
	{ reason: Schema.String }
) {}

export const wordsOf = (text: string): Array<string> =>
	text
		.toLowerCase()
		.replaceAll("’", "'")
		.match(/[a-z0-9']+/gu) ?? [];

export const likeness = (
	said: ReadonlyArray<string>,
	heard: ReadonlyArray<string>
): number => {
	if (said.length + heard.length === 0) {
		return 1;
	}

	let previous: Array<number> = Array.from(
		{ length: heard.length + 1 },
		() => 0
	);

	for (const word of said) {
		const row = [0];

		for (const [index, other] of heard.entries()) {
			row.push(
				word === other
					? (previous[index] ?? 0) + 1
					: Math.max(previous[index + 1] ?? 0, row[index] ?? 0)
			);
		}

		previous = row;
	}

	return (2 * (previous.at(-1) ?? 0)) / (said.length + heard.length);
};

export const spread = <A>(items: ReadonlyArray<A>, count: number): Array<A> =>
	items.length <= count
		? [...items]
		: Array.from(
				{ length: count },
				(_, index) => items[Math.floor((index * items.length) / count)]
			).filter((item): item is A => item !== undefined);

export class SpotCheck extends Context.Service<
	SpotCheck,
	{
		readonly listen: (
			sightings: ReadonlyArray<Sighting>
		) => Effect.Effect<
			Heard,
			CheckFailed | DecodeFailed | PlatformError.PlatformError
		>;
	}
>()("@prosody/aligner/SpotCheck", {
	make: Effect.gen(function* () {
		const audio = yield* Audio;

		const whisper = yield* Effect.cached(
			Config.String("PROSODY_ALIGNER_MODELS").pipe(
				Effect.mapError(
					(error) =>
						new CheckFailed({
							reason: `Whisper has no settings: ${String(error)}`,
						})
				),
				Effect.flatMap((models) => {
					env.cacheDir = models;

					return Effect.tryPromise({
						try: async () =>
							await pipeline("automatic-speech-recognition", CHECK_MODEL, {
								dtype: "fp32",
								session_options: { intraOpNumThreads: 4 },
							}),
						catch: (error) =>
							new CheckFailed({
								reason: `Whisper did not load: ${String(error)}`,
							}),
					});
				})
			)
		);

		const listen = Effect.fn("SpotCheck.listen")(function* (
			sightings: ReadonlyArray<Sighting>
		) {
			const chosen = spread(
				sightings.filter(
					(s) => s.end - s.begin >= SHORTEST && s.end - s.begin <= LONGEST
				),
				CLIPS
			);

			const asr = yield* whisper;
			const transcribe = async (samples: Float32Array) => await asr(samples);
			let heard = 0;

			for (const sighting of chosen) {
				const samples = yield* audio.clip(
					sighting.file,
					sighting.begin,
					sighting.end
				);

				const result = yield* Effect.tryPromise({
					try: async () => await transcribe(samples),
					catch: (error) => new CheckFailed({ reason: String(error) }),
				});

				heard +=
					likeness(wordsOf(sighting.text), wordsOf(result.text)) >= ALIKE
						? 1
						: 0;
			}

			return { checked: chosen.length, heard } satisfies Heard;
		});

		return { listen };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}

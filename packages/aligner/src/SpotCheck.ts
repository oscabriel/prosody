import { env, pipeline } from "@huggingface/transformers";
import { Config, Context, Effect, Layer, Schema } from "effect";
import type { PlatformError } from "effect";

import { Audio } from "./Audio.ts";
import type { DecodeFailed } from "./Audio.ts";

/** A second speech model, of a different family from the aligner's, so it does not share its mistakes. */
export const CHECK_MODEL = "onnx-community/whisper-base.en";

/** How many sentences a check listens to. Spike 1 found 40 enough to tell a good book from a bad one. */
const CLIPS = 40;

/** Shorter is too short to judge; longer is likely a sentence whose end ran on. */
const SHORTEST = 3;

const LONGEST = 15;

/** How alike a sentence and what was heard must be to count as heard right. */
const ALIKE = 0.8;

/** One aligned sentence to listen to: its text, and where it is in one audio file. */
export interface Sighting {
	readonly text: string;
	readonly file: string;
	readonly begin: number;
	readonly end: number;
}

/** What a spot check found: how many sentences it listened to, and how many it heard right. */
export interface Heard {
	readonly checked: number;
	readonly heard: number;
}

export class CheckFailed extends Schema.TaggedError<CheckFailed>()(
	"CheckFailed",
	{ reason: Schema.String }
) {}

/** The words of a text, lower case, with curly apostrophes made straight. */
export const wordsOf = (text: string): Array<string> =>
	text
		.toLowerCase()
		.replaceAll("’", "'")
		.match(/[a-z0-9']+/gu) ?? [];

/** How alike two lists of words are, from 0 to 1: twice their longest common run over their lengths. */
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

/** `count` items spread evenly through `items`, so a check hears the whole book. */
export const spread = <A>(items: ReadonlyArray<A>, count: number): Array<A> =>
	items.length <= count
		? [...items]
		: Array.from(
				{ length: count },
				(_, index) => items[Math.floor((index * items.length) / count)]
			).filter((item): item is A => item !== undefined);

/**
 * Listens to a spread of aligned sentences with Whisper and counts those it heard right. The aligner
 * finishes cleanly even when it is wrong; this is how a wrong alignment is caught without anyone
 * listening.
 */
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

		env.cacheDir = yield* Config.String("PROSODY_ALIGNER_MODELS");

		// Whisper loads on first use, like the aligner's model.
		const whisper = yield* Effect.cached(
			Effect.tryPromise({
				try: async () =>
					await pipeline("automatic-speech-recognition", CHECK_MODEL, {
						dtype: "fp32",
						session_options: { intraOpNumThreads: 4 },
					}),
				catch: (error) =>
					new CheckFailed({ reason: `Whisper did not load: ${String(error)}` }),
			})
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

				// One clip in, one transcript out: the pipeline returns a list only for a list.
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

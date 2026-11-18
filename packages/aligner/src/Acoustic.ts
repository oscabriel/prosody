import { availableParallelism } from "node:os";

import {
	AutoModelForCTC,
	AutoProcessor,
	AutoTokenizer,
	Tensor,
	env,
} from "@huggingface/transformers";
import {
	Config,
	Context,
	Effect,
	Layer,
	Predicate,
	Schema,
	Stream,
} from "effect";
import type { PlatformError } from "effect";

import { Audio, SAMPLE_RATE } from "./Audio.ts";
import type { DecodeFailed } from "./Audio.ts";
import type { Emissions } from "./Emissions.ts";

/** The speech model: NVIDIA's Parakeet CTC 0.6B, exported to ONNX and quantised to int8. */
export const MODEL = "onnx-community/parakeet-ctc-0.6b-ONNX";

/** One frame of the model's output covers 80 ms: 1,280 samples. */
const SAMPLES_PER_FRAME = 1280;

/** The model hears 30 seconds at a time, with 2 more on each side so no word is cut at an edge. */
const WINDOW = 30 * SAMPLE_RATE;

const CONTEXT = 2 * SAMPLE_RATE;

/** Tokens kept per frame. */
const KEPT = 16;

/** Loudness is measured every 10 ms. */
const LOUDNESS_STEP = SAMPLE_RATE / 100;

/** The speech model could not run. */
export class ListenFailed extends Schema.TaggedError<ListenFailed>()(
	"ListenFailed",
	{ reason: Schema.String }
) {}

/** Grows a typed array's worth of numbers without knowing the count up front. */
class Growing {
	#data: Float32Array;
	#length = 0;

	constructor(capacity: number) {
		this.#data = new Float32Array(capacity);
	}

	push(value: number) {
		if (this.#length === this.#data.length) {
			const next = new Float32Array(this.#data.length * 2);
			next.set(this.#data);
			this.#data = next;
		}

		this.#data[this.#length] = value;
		this.#length += 1;
	}

	get length() {
		return this.#length;
	}

	done(): Float32Array {
		return this.#data.slice(0, this.#length);
	}
}

/**
 * Listens to a book's audio with the speech model and keeps what it heard: for every 80 ms, the
 * likeliest tokens and the blank. The model loads once, when the layer is built.
 */
export class Acoustic extends Context.Service<
	Acoustic,
	{
		readonly listen: (
			files: ReadonlyArray<string>
		) => Effect.Effect<
			Emissions,
			ListenFailed | DecodeFailed | PlatformError.PlatformError
		>;
		/** Spoken words as the model's tokens. */
		readonly tokensOf: (
			words: ReadonlyArray<string>
		) => Effect.Effect<Array<ReadonlyArray<number>>, ListenFailed>;
	}
>()("@prosody/aligner/Acoustic", {
	make: Effect.gen(function* () {
		const audio = yield* Audio;
		const models = yield* Config.String("PROSODY_ALIGNER_MODELS");

		const threads = yield* Config.Int("PROSODY_ALIGNER_THREADS").pipe(
			Config.withDefault(availableParallelism())
		);

		env.cacheDir = models;

		// The models load on first use, not with the layer, so a model that won't load fails one
		// alignment, with a reason, instead of the whole press.
		const load = yield* Effect.cached(
			Effect.tryPromise({
				try: async () => ({
					processor: await AutoProcessor.from_pretrained(MODEL),
					tokenizer: await AutoTokenizer.from_pretrained(MODEL),
					model: await AutoModelForCTC.from_pretrained(MODEL, {
						dtype: "int8",
						session_options: { intraOpNumThreads: threads },
					}),
				}),
				catch: (error) =>
					new ListenFailed({
						reason: `the speech model did not load: ${String(error)}`,
					}),
			}).pipe(
				Effect.map((loaded) => {
					// The tokenizer's last id is the blank, which the model scores apart from the tokens.
					const vocabulary: Array<string> = [];

					for (const [piece, id] of loaded.tokenizer.get_vocab()) {
						vocabulary[id] = piece;
					}

					vocabulary.length = Math.max(0, vocabulary.length - 1);

					return { ...loaded, vocabulary, blankId: vocabulary.length };
				})
			)
		);

		/** The model's log-probabilities for one stretch of samples: frames by tokens plus the blank. */
		const hear = (samples: Float32Array) =>
			Effect.flatMap(load, (loaded) =>
				Effect.tryPromise({
					try: async () => {
						const inputs: unknown = await loaded.processor(samples);
						const output: unknown = await loaded.model(inputs);

						const logits = Predicate.hasProperty(output, "logits")
							? output.logits
							: undefined;

						if (
							!(logits instanceof Tensor) ||
							!(logits.data instanceof Float32Array)
						) {
							throw new TypeError("the speech model returned no float logits");
						}

						const [, frames = 0, classes = 0] = logits.dims;

						return { data: logits.data, frames, classes };
					},
					catch: (error) =>
						new ListenFailed({
							reason: `the speech model failed: ${String(error)}`,
						}),
				})
			);

		const listen = Effect.fn("Acoustic.listen")(function* (
			files: ReadonlyArray<string>
		) {
			const { vocabulary, blankId } = yield* load;
			const ids: Array<Uint16Array> = [];
			const scores: Array<Float32Array> = [];
			const blank = new Growing(2 ** 20);
			const loudness = new Growing(2 ** 22);
			const tracks: Array<number> = [];

			// Samples not yet heard, starting at sample `bufferStart` of the whole book.
			let buffer = new Float32Array(WINDOW + 2 * CONTEXT);
			let buffered = 0;
			let bufferStart = 0;
			// The next window's first sample, and every sample read so far.
			let windowStart = 0;
			let total = 0;
			// Bytes of a float split across two reads.
			let carry = new Uint8Array(0);
			// Loudness accumulates over 10 ms.
			let energy = 0;
			let energyCount = 0;

			/** Keep one heard window's frames that fall inside it, not in its context. */
			const keep = (
				heard: { data: Float32Array; frames: number; classes: number },
				inputStart: number,
				end: number
			) => {
				const firstFrame = inputStart / SAMPLES_PER_FRAME;
				const from = windowStart / SAMPLES_PER_FRAME;
				const to = Math.ceil(end / SAMPLES_PER_FRAME);

				const count = Math.max(
					0,
					Math.min(to, firstFrame + heard.frames) - from
				);

				const windowIds = new Uint16Array(count * KEPT);
				const windowScores = new Float32Array(count * KEPT);
				const best = new Float32Array(KEPT);
				const bestIds = new Uint16Array(KEPT);

				for (let index = 0; index < count; index += 1) {
					const row = (from + index - firstFrame) * heard.classes;
					let max = -Infinity;

					for (let c = 0; c < heard.classes; c += 1) {
						max = Math.max(max, heard.data[row + c] ?? -Infinity);
					}

					let sum = 0;

					for (let c = 0; c < heard.classes; c += 1) {
						sum += Math.exp((heard.data[row + c] ?? -Infinity) - max);
					}

					const norm = max + Math.log(sum);
					best.fill(-Infinity);

					for (let c = 0; c < heard.classes; c += 1) {
						if (c === blankId) {
							continue;
						}

						const value = (heard.data[row + c] ?? -Infinity) - norm;

						if (value <= (best[KEPT - 1] ?? -Infinity)) {
							continue;
						}

						let at = KEPT - 1;

						while (at > 0 && (best[at - 1] ?? -Infinity) < value) {
							best[at] = best[at - 1] ?? -Infinity;
							bestIds[at] = bestIds[at - 1] ?? 0;
							at -= 1;
						}

						best[at] = value;
						bestIds[at] = c;
					}

					windowIds.set(bestIds, index * KEPT);
					windowScores.set(best, index * KEPT);
					blank.push((heard.data[row + blankId] ?? -Infinity) - norm);
				}

				ids.push(windowIds);
				scores.push(windowScores);
			};

			/** Hear every window that has all its samples, or, at the end, every window left. */
			const drain = Effect.fnUntraced(function* (ended: boolean) {
				// A window waits for its samples and the context after them, until the audio has ended.
				const wanted = ended ? 0 : WINDOW + CONTEXT;

				while (windowStart < total && total >= windowStart + wanted) {
					const inputStart = Math.max(0, windowStart - CONTEXT);
					const inputEnd = Math.min(total, windowStart + WINDOW + CONTEXT);
					const end = Math.min(total, windowStart + WINDOW);

					const heard = yield* hear(
						buffer.slice(inputStart - bufferStart, inputEnd - bufferStart)
					);

					keep(heard, inputStart, end);
					windowStart += WINDOW;

					// Drop what no later window needs.
					const drop = Math.max(0, windowStart - CONTEXT - bufferStart);
					buffer.copyWithin(0, drop, buffered);
					buffered -= drop;
					bufferStart += drop;
				}
			});

			const take = (bytes: Uint8Array) => {
				const joined = new Uint8Array(carry.length + bytes.length);
				joined.set(carry);
				joined.set(bytes, carry.length);
				const whole = joined.length - (joined.length % 4);
				carry = joined.slice(whole);
				const samples = new Float32Array(joined.buffer.slice(0, whole));

				if (buffered + samples.length > buffer.length) {
					const next = new Float32Array(
						Math.max(buffer.length * 2, buffered + samples.length)
					);

					next.set(buffer.subarray(0, buffered));
					buffer = next;
				}

				buffer.set(samples, buffered);
				buffered += samples.length;
				total += samples.length;

				for (const sample of samples) {
					energy += sample * sample;
					energyCount += 1;

					if (energyCount === LOUDNESS_STEP) {
						loudness.push(10 * Math.log10(energy / LOUDNESS_STEP + 1e-10));
						energy = 0;
						energyCount = 0;
					}
				}
			};

			for (const file of files) {
				const before = total;

				yield* audio.samples(file).pipe(
					Stream.runForEach((bytes) =>
						Effect.suspend(() => {
							take(bytes);

							return drain(false);
						})
					)
				);
				tracks.push((total - before) / SAMPLE_RATE);
			}

			yield* drain(true);

			const frames = blank.length;
			const joinedIds = new Uint16Array(frames * KEPT);
			const joinedScores = new Float32Array(frames * KEPT);
			let at = 0;

			for (const [index, part] of ids.entries()) {
				joinedIds.set(part, at);
				joinedScores.set(scores[index] ?? new Float32Array(0), at);
				at += part.length;
			}

			return {
				frames,
				secondsPerFrame: SAMPLES_PER_FRAME / SAMPLE_RATE,
				kept: KEPT,
				ids: joinedIds,
				scores: joinedScores,
				blank: blank.done(),
				loudness: loudness.done(),
				secondsPerLoudness: LOUDNESS_STEP / SAMPLE_RATE,
				tracks,
				vocabulary,
			} satisfies Emissions;
		});

		const pieces = new Map<string, ReadonlyArray<number>>();

		const tokensOf = Effect.fn("Acoustic.tokensOf")(function* (
			words: ReadonlyArray<string>
		) {
			const { tokenizer } = yield* load;

			return words.map((word) => {
				const known = pieces.get(word);

				if (known !== undefined) {
					return known;
				}

				const encoded = tokenizer.encode(` ${word}`, {
					add_special_tokens: false,
				});

				pieces.set(word, encoded);

				return encoded;
			});
		});

		return { listen, tokensOf };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make).pipe(
		Layer.provide(Audio.layer)
	);
}

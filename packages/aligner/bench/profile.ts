import { spawnSync } from "node:child_process";

import {
	AutoModelForCTC,
	AutoProcessor,
	Tensor,
	env,
} from "@huggingface/transformers";
import { Console, Effect, Predicate, Schema } from "effect";

import { MODEL } from "../src/Acoustic.ts";

const [file = ""] = process.argv.slice(2);

const threads = Number(process.env.THREADS ?? "8");

const windowSeconds = Number(process.env.WINDOW ?? "30");

const contextSeconds = Number(process.env.CONTEXT ?? "2");

const repeat = Number(process.env.REPEAT ?? "1");

const RATE = 16_000;

const dtype = Schema.decodeUnknownSync(
	Schema.Literals(["int8", "fp32", "fp16", "q4"])
)(process.env.DTYPE ?? "int8");

const sessionJson = process.env.SESSION ?? "{}";

const session = Schema.decodeSync(
	Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown))
)(sessionJson);

env.cacheDir = process.env.PROSODY_ALIGNER_MODELS ?? "";

let clock = performance.now();

const lap = () => {
	const now = performance.now();
	const seconds = (now - clock) / 1000;
	clock = now;

	return seconds;
};

const decoded = spawnSync(
	"ffmpeg",
	[
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
		String(RATE),
		"-",
	],
	{ maxBuffer: 2 ** 31 - 1 }
);

const samples = new Float32Array(
	decoded.stdout.buffer,
	decoded.stdout.byteOffset,
	Math.floor(decoded.stdout.byteLength / 4)
);

const decodeSeconds = lap();

const processor = await AutoProcessor.from_pretrained(MODEL);

const model = await AutoModelForCTC.from_pretrained(MODEL, {
	dtype,
	session_options: { intraOpNumThreads: threads, ...session },
});

const loadSeconds = lap();

const audioSeconds = samples.length / RATE;

const window = windowSeconds * RATE;

const context = contextSeconds * RATE;

const hear = async (pcm: Float32Array) => {
	clock = performance.now();

	const inputs: unknown = await processor(pcm);
	const features = lap();
	const output: unknown = await model(inputs);
	const inference = lap();

	const logits = Predicate.hasProperty(output, "logits")
		? output.logits
		: undefined;

	const data =
		logits instanceof Tensor && logits.data instanceof Float32Array
			? logits.data
			: new Float32Array(0);

	const [, count = 0, classes = 0] =
		logits instanceof Tensor ? logits.dims : [];

	return { features, inference, data, count, classes };
};

const pass = Effect.gen(function* () {
	let features = 0;
	let inference = 0;
	let keeping = 0;
	let frames = 0;
	let spoken = 0;

	for (let start = 0; start < samples.length; start += window) {
		const from = Math.max(0, start - context);
		const to = Math.min(samples.length, start + window + context);

		const heard = yield* Effect.promise(
			async () => await hear(samples.slice(from, to))
		);

		const { data, count, classes } = heard;

		features += heard.features;
		inference += heard.inference;

		for (let frame = 0; frame < count; frame += 1) {
			let max = -Infinity;
			let best = 0;

			for (let c = 0; c < classes; c += 1) {
				const value = data[frame * classes + c] ?? -Infinity;

				if (value > max) {
					max = value;
					best = c;
				}
			}

			let sum = 0;

			for (let c = 0; c < classes; c += 1) {
				sum += Math.exp((data[frame * classes + c] ?? -Infinity) - max);
			}

			spoken += best === classes - 1 || sum === 0 ? 0 : 1;
		}

		frames += count;
		keeping += lap();
	}

	const total = features + inference + keeping;

	yield* Console.log(
		`${dtype} threads ${threads} window ${windowSeconds}+${contextSeconds} s ${sessionJson}: ` +
			`${(audioSeconds / (total + decodeSeconds)).toFixed(1)}x real time ` +
			`(decode ${decodeSeconds.toFixed(1)} s, features ${features.toFixed(1)} s, model ${inference.toFixed(1)} s, keeping ${keeping.toFixed(1)} s; ` +
			`load ${loadSeconds.toFixed(1)} s; ${frames} frames, ${spoken} not blank)`
	);
});

await Effect.runPromise(Effect.repeat(pass, { times: repeat - 1 }));

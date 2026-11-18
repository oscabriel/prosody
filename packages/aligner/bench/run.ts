/**
 * Align one pair end to end through the Aligner service, as the press will.
 *
 *   PROSODY_ALIGNER_MODELS=<dir> bun bench/run.ts <out folder> <book.epub> <emissions file> <audio>...
 */
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, Layer } from "effect";

import { Aligner } from "../src/Aligner.ts";

const [out, epub, emissions, ...audio] = process.argv.slice(2);

const program = Effect.gen(function* () {
	const aligner = yield* Aligner;
	const started = performance.now();
	const result = yield* aligner.align({
		audio,
		epub: epub ?? "",
		copy: `${out}/copy.epub`,
		timeline: `${out}/timeline.json`,
		emissions,
	});
	yield* Console.log(
		`${result.sentences} sentences, ${result.aligned} aligned; spot check heard ${result.heard} of ${result.checked}; ${((performance.now() - started) / 1000).toFixed(1)} s`
	);
});

BunRuntime.runMain(
	program.pipe(
		Effect.provide(Aligner.layer.pipe(Layer.provideMerge(BunServices.layer)))
	)
);

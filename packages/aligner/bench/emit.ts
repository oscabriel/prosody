import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, FileSystem, Layer } from "effect";

import { Acoustic } from "../src/Acoustic.ts";
import { encode } from "../src/Emissions.ts";

const [out, ...files] = process.argv.slice(2);

const program = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const acoustic = yield* Acoustic;
	const started = performance.now();
	const emissions = yield* acoustic.listen(files);
	const seconds = (performance.now() - started) / 1000;
	const audio = emissions.tracks.reduce((a, b) => a + b, 0);

	yield* fs.writeFile(out ?? "out.emissions", encode(emissions));
	yield* Console.log(
		`${(audio / 3600).toFixed(2)} h of audio in ${(seconds / 60).toFixed(1)} min, ${(audio / seconds).toFixed(1)}x; ${emissions.frames} frames`
	);
});

BunRuntime.runMain(
	program.pipe(
		Effect.provide(Acoustic.layer.pipe(Layer.provideMerge(BunServices.layer)))
	)
);

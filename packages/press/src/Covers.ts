import { COVER } from "@prosody/domain/Reading/Copy";
import { Context, Effect, Layer, Option } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

export class Covers extends Context.Service<
	Covers,
	{
		readonly make: (
			source: string,
			folder: string
		) => Effect.Effect<Option.Option<string>>;
	}
>()("@prosody/press/Covers", {
	make: Effect.gen(function* () {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

		const make = Effect.fn("Covers.make")(function* (
			source: string,
			folder: string
		) {
			const exitCode = yield* spawner.exitCode(
				ChildProcess.make("ffmpeg", [
					"-v",
					"error",
					"-i",
					source,
					"-map",
					"0:v:0",
					"-frames:v",
					"1",
					"-vf",
					"scale=-2:'min(800,ih)'",
					"-q:v",
					"3",
					"-y",
					`${folder}/${COVER}`,
				])
			);

			return exitCode === 0 ? Option.some(COVER) : Option.none();
		}, Effect.orElseSucceed(Option.none));

		return { make };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}

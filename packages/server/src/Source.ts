import { Array, Effect, FileSystem, Order, Path } from "effect";
import { Digest } from "effect/crypto";

export const fingerprintOf = (paths: ReadonlyArray<string>) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const digest = yield* Digest.Digest;
		const parts: Array<string> = [];

		if (!(yield* fs.exists(paths[0] ?? ""))) {
			return "none";
		}

		for (const entry of paths) {
			const files =
				(yield* fs.stat(entry)).type === "File"
					? [entry]
					: Array.map(
							Array.sort(
								yield* fs.readDirectory(entry, { recursive: true }),
								Order.String
							),
							(name) => path.join(entry, name)
						);

			for (const file of files) {
				if ((yield* fs.stat(file)).type === "File") {
					parts.push(file, yield* fs.readFileString(file));
				}
			}
		}

		const bytes = new TextEncoder().encode(parts.join("\0"));

		return (yield* digest.digestHex(Digest.sha256, bytes)).slice(0, 16);
	}).pipe(Effect.orDie, Effect.provide(Digest.layerWebCrypto));

export const sourceFingerprint = fingerprintOf([
	"packages/domain/src",
	"packages/server/src",
	"packages/press/src",
	"packages/aligner/src",
]);

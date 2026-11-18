import { Array, Effect, FileSystem, Order, Path } from "effect";
import { Digest } from "effect/crypto";

/** The folders the services are bundled from, named from the repository's root, where deploys run. */
const FOLDERS = [
	"packages/domain/src",
	"packages/server/src",
	"packages/press/src",
];

/**
 * A fingerprint of the services' source, read when a deploy is planned. Alchemy 2.0.0-beta.87
 * rebuilds a service's image when its settings change, but misses a change to its code alone when
 * those settings depend on other resources, as the Api's networks do. A service that carries this
 * fingerprint as a setting is rebuilt whenever the code it is bundled from changes.
 *
 * A service's container runs its settings too, when it starts, and has no source to read. There
 * the fingerprint is "none", which is never compared with anything.
 */
export const sourceFingerprint = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const digest = yield* Digest.Digest;
	const parts: Array<string> = [];

	if (!(yield* fs.exists(FOLDERS[0] ?? ""))) {
		return "none";
	}

	for (const folder of FOLDERS) {
		const names = Array.sort(
			yield* fs.readDirectory(folder, { recursive: true }),
			Order.String
		);

		for (const name of names) {
			const file = path.join(folder, name);

			if ((yield* fs.stat(file)).type === "File") {
				parts.push(file, yield* fs.readFileString(file));
			}
		}
	}

	const bytes = new TextEncoder().encode(parts.join("\0"));

	return (yield* digest.digestHex(Digest.sha256, bytes)).slice(0, 16);
}).pipe(Effect.orDie, Effect.provide(Digest.layerWebCrypto));

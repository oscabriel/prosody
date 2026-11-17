import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Option, Path } from "effect";
import { Digest } from "effect/crypto";

import { Stacks } from "../src/Stacks.ts";

/** The real walk, on the real file system of this machine. */
const StacksTest = Stacks.layer.pipe(
	Layer.provideMerge(Layer.mergeAll(NodeServices.layer, Digest.layerWebCrypto))
);

/** A small library in a temporary folder, removed when the test ends. */
const library = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const root = yield* fs.makeTempDirectoryScoped({ prefix: "prosody-stacks-" });

	const put = Effect.fnUntraced(function* (file: string, bytes: number) {
		yield* fs.makeDirectory(path.dirname(path.join(root, file)), {
			recursive: true,
		});
		yield* fs.writeFile(path.join(root, file), new Uint8Array(bytes));
	});

	yield* put(
		"ebooks/Andy Weir/Project Hail Mary/Project Hail Mary - Andy Weir.epub",
		10
	);
	yield* put(
		"ebooks/Andy Weir/Project Hail Mary/Project Hail Mary - Andy Weir.jpg",
		3
	);
	yield* put(
		"audiobooks/Andy Weir/Project Hail Mary/Andy Weir - Project Hail Mary.m4b",
		20
	);
	yield* put("ebooks/Homer/The Odyssey/The Odyssey - Homer.epub", 5);
	yield* fs.makeDirectory(
		path.join(root, "ebooks/Eric Evans/Domain-Driven Design"),
		{
			recursive: true,
		}
	);

	return root;
});

layer(StacksTest)("the stacks", (it) => {
	it.effect("pairs the two halves of the library by shelfmark", () =>
		Effect.gen(function* () {
			const stacks = yield* Stacks;
			const root = yield* library;

			const { books, unreadable } = yield* stacks.survey(root);

			assert.deepStrictEqual(unreadable, []);
			assert.deepStrictEqual(books, [
				{
					shelfmark: "Andy Weir/Project Hail Mary",
					author: "Andy Weir",
					title: "Project Hail Mary",
					text: Option.some({
						file: "Project Hail Mary - Andy Weir.epub",
						bytes: 10,
					}),
					audio: Option.some({
						file: "Andy Weir - Project Hail Mary.m4b",
						bytes: 20,
					}),
				},
				{
					shelfmark: "Homer/The Odyssey",
					author: "Homer",
					title: "The Odyssey",
					text: Option.some({ file: "The Odyssey - Homer.epub", bytes: 5 }),
					audio: Option.none(),
				},
			]);
		})
	);

	it.effect("reports a missing half without stopping", () =>
		Effect.gen(function* () {
			const stacks = yield* Stacks;
			const path = yield* Path.Path;
			const root = yield* library;

			const { books, unreadable } = yield* stacks.survey(
				path.join(root, "ebooks")
			);

			assert.deepStrictEqual(books, []);
			assert.lengthOf(unreadable, 2);
		})
	);

	it.effect("gives a shelfmark the same id on every walk", () =>
		Effect.gen(function* () {
			const stacks = yield* Stacks;
			const odyssey = yield* stacks.workIdOf("Homer/The Odyssey");

			assert.strictEqual(yield* stacks.workIdOf("Homer/The Odyssey"), odyssey);
			assert.match(odyssey, /^w-[0-9a-f]{12}$/u);
			assert.notStrictEqual(yield* stacks.workIdOf("Homer/The Iliad"), odyssey);
		})
	);
});

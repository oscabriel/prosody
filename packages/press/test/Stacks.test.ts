import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Shelfmark } from "@prosody/domain/Library/Shelfmark";
import { Effect, FileSystem, Layer, Option, Path } from "effect";
import { Digest } from "effect/crypto";

import { Stacks, Unshelvable } from "../src/Stacks.ts";

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
	yield* put(
		"ebooks/Eric Evans/Domain-Driven Design/Domain-Driven Design - Eric Evans.pdf",
		30
	);

	return root;
});

layer(StacksTest)("the stacks", (it) => {
	it.effect("finds each work's editions in both halves of the library", () =>
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
					pages: Option.none(),
				},
				{
					shelfmark: "Eric Evans/Domain-Driven Design",
					author: "Eric Evans",
					title: "Domain-Driven Design",
					text: Option.none(),
					audio: Option.none(),
					pages: Option.some({
						file: "Domain-Driven Design - Eric Evans.pdf",
						bytes: 30,
					}),
				},
				{
					shelfmark: "Homer/The Odyssey",
					author: "Homer",
					title: "The Odyssey",
					text: Option.some({ file: "The Odyssey - Homer.epub", bytes: 5 }),
					audio: Option.none(),
					pages: Option.none(),
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

	it.effect(
		"copies a payload's edition into its work's folder, and leaves the payload",
		() =>
			Effect.gen(function* () {
				const stacks = yield* Stacks;
				const fs = yield* FileSystem.FileSystem;
				const path = yield* Path.Path;
				const root = yield* library;
				const downloads = yield* fs.makeTempDirectoryScoped();
				const payload = path.join(downloads, "Dungeon Crawler Carl [M4B]");

				yield* fs.makeDirectory(path.join(payload, "art"), { recursive: true });
				yield* fs.writeFile(path.join(payload, "dcc.m4b"), new Uint8Array(30));
				yield* fs.writeFile(
					path.join(payload, "art", "cover.jpg"),
					new Uint8Array(3)
				);

				const shelved = yield* stacks.shelve(root, downloads, {
					kind: "audio",
					payload: "Dungeon Crawler Carl [M4B]",
					shelfmark: Shelfmark.make("Matt Dinniman/Dungeon Crawler Carl"),
				});

				assert.deepStrictEqual(shelved, {
					file: "Dungeon Crawler Carl - Matt Dinniman.m4b",
					bytes: 30,
				});
				assert.deepStrictEqual(
					yield* fs.readDirectory(
						path.join(root, "audiobooks/Matt Dinniman/Dungeon Crawler Carl")
					),
					["Dungeon Crawler Carl - Matt Dinniman.m4b"]
				);
				assert.isTrue(yield* fs.exists(path.join(payload, "dcc.m4b")));
			})
	);

	it.effect("never puts a second edition of a kind in a folder", () =>
		Effect.gen(function* () {
			const stacks = yield* Stacks;
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const root = yield* library;
			const downloads = yield* fs.makeTempDirectoryScoped();

			yield* fs.writeFile(path.join(downloads, "phm.m4b"), new Uint8Array(7));

			const refusal = yield* Effect.flip(
				stacks.shelve(root, downloads, {
					kind: "audio",
					payload: "phm.m4b",
					shelfmark: Shelfmark.make("Andy Weir/Project Hail Mary"),
				})
			);

			assert.deepStrictEqual(
				refusal,
				new Unshelvable({
					reason:
						"Andy Weir/Project Hail Mary already has Andy Weir - Project Hail Mary.m4b",
				})
			);
		})
	);

	it.effect("writes nowhere but a work's own folder", () =>
		Effect.gen(function* () {
			const stacks = yield* Stacks;
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const root = yield* library;
			const downloads = yield* fs.makeTempDirectoryScoped();

			yield* fs.writeFile(path.join(downloads, "x.epub"), new Uint8Array(7));

			for (const shelfmark of ["Homer/..", "../..", "Homer/", "Homer"]) {
				const refusal = yield* Effect.flip(
					stacks.shelve(root, downloads, {
						kind: "text",
						payload: "x.epub",
						shelfmark: Shelfmark.make(shelfmark),
					})
				);

				assert.strictEqual(refusal._tag, "Unshelvable");
			}

			assert.deepStrictEqual(
				(yield* fs.readDirectory(path.join(root, "ebooks"))).toSorted(),
				["Andy Weir", "Eric Evans", "Homer"]
			);
			assert.deepStrictEqual(
				yield* fs.readDirectory(path.join(root, "ebooks", "Homer")),
				["The Odyssey"]
			);
		})
	);

	it.effect("writes nothing into a library that reads as empty", () =>
		Effect.gen(function* () {
			const stacks = yield* Stacks;
			const fs = yield* FileSystem.FileSystem;
			const empty = yield* fs.makeTempDirectoryScoped();

			const refusal = yield* Effect.flip(
				stacks.shelve(empty, empty, {
					kind: "text",
					payload: "anything",
					shelfmark: Shelfmark.make("Homer/The Iliad"),
				})
			);

			assert.strictEqual(refusal._tag, "StacksUnavailable");
			assert.deepStrictEqual(yield* fs.readDirectory(empty), []);
		})
	);
});

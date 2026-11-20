import {
	Array,
	Context,
	Effect,
	FileSystem,
	Layer,
	Option,
	Order,
	Path,
	Record,
	Result,
} from "effect";
import type { PlatformError } from "effect";
import { Digest } from "effect/crypto";

/** One file found in the library: its name inside the work's folder, and its size. */
export interface Found {
	readonly file: string;
	readonly bytes: number;
}

/** One `Author/Title` folder, with the text and the audio found for it. */
export interface Book {
	readonly shelfmark: string;
	readonly author: string;
	readonly title: string;
	readonly text: Option.Option<Found>;
	readonly audio: Option.Option<Found>;
}

/** What one walk of the library saw. `unreadable` lists folders that failed, with the reason. */
export interface Survey {
	readonly books: ReadonlyArray<Book>;
	readonly unreadable: ReadonlyArray<string>;
}

/** The library's two halves, and the file each holds for a work. */
const HALVES = [
	{ folder: "ebooks", kind: "text", extension: ".epub" },
	{ folder: "audiobooks", kind: "audio", extension: ".m4b" },
] as const;

/** One edition seen in one folder. */
interface Sighting {
	readonly shelfmark: string;
	readonly author: string;
	readonly title: string;
	readonly kind: (typeof HALVES)[number]["kind"];
	readonly found: Found;
}

/** What a look into one folder gives: the editions seen, or why the folder could not be read. */
type Look = ReadonlyArray<Result.Result<Sighting, string>>;

/** Gather a work's sightings, from both halves, into one book. */
const bookOf = (sightings: Array.NonEmptyReadonlyArray<Sighting>): Book => {
	const { shelfmark, author, title } = Array.headNonEmpty(sightings);

	const edition = (kind: Sighting["kind"]) =>
		Option.map(
			Array.findFirst(sightings, (sighting) => sighting.kind === kind),
			(sighting) => sighting.found
		);

	return {
		shelfmark,
		author,
		title,
		text: edition("text"),
		audio: edition("audio"),
	};
};

/** Look into a folder, and go on to each thing found there. A failure is reported, not raised. */
const lookInto = <A>(
	what: string,
	read: Effect.Effect<ReadonlyArray<A>, PlatformError.PlatformError>,
	then: (item: A) => Effect.Effect<Look>
): Effect.Effect<Look> =>
	Effect.matchEffect(read, {
		onFailure: (failure) =>
			Effect.succeed([Result.fail(`${what}: ${failure.message}`)]),
		onSuccess: (items) =>
			Effect.map(
				Effect.forEach(items, then, { concurrency: 1 }),
				Array.flatten
			),
	});

/**
 * The library, read through Effect's file system. `survey` never fails: a folder that
 * cannot be read is reported and skipped, and never stops the walk. A failing mount can also list
 * a folder as empty with no error; that costs nothing, because the press only ever adds what it
 * finds.
 */
export class Stacks extends Context.Service<
	Stacks,
	{
		/** Walk `<root>/ebooks/<Author>/<Title>` and `<root>/audiobooks/<Author>/<Title>`. */
		readonly survey: (root: string) => Effect.Effect<Survey>;
		/** A work's id, made from its shelfmark so every walk gives the same folder the same id. */
		readonly workIdOf: (shelfmark: string) => Effect.Effect<string>;
	}
>()("@prosody/press/Stacks", {
	make: Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const digest = yield* Digest.Digest;

		/** The folders directly inside `folder`, by name. */
		const foldersIn = (folder: string) =>
			Effect.map(fs.readDirectoryEntries(folder), (entries) =>
				Array.sort(
					Array.flatMap(entries, (entry) =>
						entry.type === "Directory" ? [entry.name] : []
					),
					Order.String
				)
			);

		/** The first file in `folder` with this extension, by name, and its size. */
		const firstFile = Effect.fnUntraced(function* (
			folder: string,
			extension: string
		) {
			const names = yield* fs.readDirectory(folder);

			const first = Array.head(
				Array.sort(
					Array.filter(names, (name) => name.toLowerCase().endsWith(extension)),
					Order.String
				)
			);

			if (Option.isNone(first)) {
				return [];
			}

			const info = yield* fs.stat(path.join(folder, first.value));

			return [{ file: first.value, bytes: Number(info.size) }];
		});

		const survey = Effect.fn("Stacks.survey")(function* (root: string) {
			const looks = yield* Effect.forEach(
				HALVES,
				(half) =>
					lookInto(
						half.folder,
						foldersIn(path.join(root, half.folder)),
						(author) => {
							const here = path.join(half.folder, author);

							return lookInto(
								here,
								foldersIn(path.join(root, here)),
								(title) => {
									const shelfmark = `${author}/${title}`;
									const folder = path.join(here, title);

									return lookInto(
										folder,
										firstFile(path.join(root, folder), half.extension),
										(found) =>
											Effect.succeed([
												Result.succeed({
													shelfmark,
													author,
													title,
													kind: half.kind,
													found,
												}),
											])
									);
								}
							);
						}
					),
				{ concurrency: 1 }
			);

			const [sightings, unreadable] = Array.separate(Array.flatten(looks));

			const byShelfmark = Array.groupBy(
				sightings,
				(sighting) => sighting.shelfmark
			);

			return {
				books: Array.map(Record.values(byShelfmark), bookOf),
				unreadable,
			};
		});

		const workIdOf = Effect.fn("Stacks.workIdOf")(function* (
			shelfmark: string
		) {
			const bytes = new TextEncoder().encode(shelfmark.normalize("NFC"));
			const hex = yield* digest.digestHex(Digest.sha256, bytes);

			return `w-${hex.slice(0, 12)}`;
		});

		return { survey, workIdOf };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}

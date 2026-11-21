import type { EditionKind } from "@prosody/domain/Library/ShelveEdition.command";
import type { ShelveRequest } from "@prosody/domain/Library/Stacks.external";
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
	Schema,
} from "effect";
import type { PlatformError } from "effect";
import { Digest } from "effect/crypto";

/** One file found in the library: its name inside the work's folder, and its size. */
export interface Found {
	readonly file: string;
	readonly bytes: number;
}

/** One `Author/Title` folder, with the text, the audio and the pages found for it. */
export interface Book {
	readonly shelfmark: string;
	readonly author: string;
	readonly title: string;
	readonly text: Option.Option<Found>;
	readonly audio: Option.Option<Found>;
	readonly pages: Option.Option<Found>;
}

/** What one walk of the library saw. `unreadable` lists folders that failed, with the reason. */
export interface Survey {
	readonly books: ReadonlyArray<Book>;
	readonly unreadable: ReadonlyArray<string>;
}

/** The library or the downloads did not answer, so nothing was written. Shelving tries again later. */
export class StacksUnavailable extends Schema.TaggedError<StacksUnavailable>()(
	"StacksUnavailable",
	{ reason: Schema.String }
) {}

/** The payload can't be shelved as it is, for this reason. */
export class Unshelvable extends Schema.TaggedError<Unshelvable>()(
	"Unshelvable",
	{ reason: Schema.String }
) {}

/** How long a mount has to answer before it counts as dropped. */
const MOUNT_TIME = "8 seconds";

/** The library's two halves, and the kinds of edition each holds. */
const HALVES = [
	{ folder: "ebooks", kinds: ["text", "pages"] },
	{ folder: "audiobooks", kinds: ["audio"] },
] as const;

/** The file each kind of edition is, by its ending. */
const EXTENSIONS = {
	text: ".epub",
	pages: ".pdf",
	audio: ".m4b",
} as const satisfies Record<EditionKind, string>;

/** One edition seen in one folder. */
interface Sighting {
	readonly shelfmark: string;
	readonly author: string;
	readonly title: string;
	readonly kind: EditionKind;
	readonly found: Found;
}

/** What a look into one folder gives: the editions seen, or why the folder could not be read. */
type Look = ReadonlyArray<Result.Result<Sighting, string>>;

/** Gather a work's sightings, from both halves, into one book. */
const bookOf = (sightings: Array.NonEmptyReadonlyArray<Sighting>): Book => {
	const { shelfmark, author, title } = Array.headNonEmpty(sightings);

	const edition = (kind: EditionKind) =>
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
		pages: edition("pages"),
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
 * The library, read through Effect's file system. It may be a network share, so `survey` never
 * fails: a folder that cannot be read is reported and skipped, and never stops the walk. A failing
 * mount can also list a folder as empty with no error; that costs nothing, because the press only
 * ever adds what it finds.
 */
export class Stacks extends Context.Service<
	Stacks,
	{
		/** Walk `<root>/ebooks/<Author>/<Title>` and `<root>/audiobooks/<Author>/<Title>`. */
		readonly survey: (root: string) => Effect.Effect<Survey>;
		/** A work's id, made from its shelfmark so every walk gives the same folder the same id. */
		readonly workIdOf: (shelfmark: string) => Effect.Effect<string>;
		/**
		 * Copy a payload's edition from `downloads` into its work's folder in the library at `root`,
		 * never moving it, once both answer.
		 */
		readonly shelve: (
			root: string,
			downloads: string,
			request: Pick<ShelveRequest, "kind" | "payload" | "shelfmark">
		) => Effect.Effect<Found, StacksUnavailable | Unshelvable>;
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

									const editions = Effect.forEach(
										half.kinds,
										(kind) =>
											Effect.map(
												firstFile(path.join(root, folder), EXTENSIONS[kind]),
												Array.map((found) => ({ kind, found }))
											),
										{ concurrency: 1 }
									);

									return lookInto(
										folder,
										Effect.map(editions, Array.flatten),
										({ kind, found }) =>
											Effect.succeed([
												Result.succeed({
													shelfmark,
													author,
													title,
													kind,
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

		/** Read a folder, or say it did not answer: a share that has dropped hangs, or reads empty. */
		const answer = (folder: string, name: string) =>
			fs.readDirectory(folder).pipe(
				Effect.timeout(MOUNT_TIME),
				Effect.tapError(Effect.logWarning),
				Effect.mapError(
					() => new StacksUnavailable({ reason: `The ${name} did not answer` })
				)
			);

		/** The files in a payload with this extension: the payload itself, or those in its folder. */
		const editionsIn = Effect.fnUntraced(function* (
			payload: string,
			extension: string
		) {
			const isEdition = (name: string) =>
				name.toLowerCase().endsWith(extension);

			if ((yield* fs.stat(payload)).type !== "Directory") {
				return isEdition(payload) ? [payload] : [];
			}

			const names = yield* fs.readDirectory(payload, { recursive: true });

			return names.filter(isEdition).map((name) => path.join(payload, name));
		});

		const shelve = Effect.fn("Stacks.shelve")(
			function* (
				root: string,
				downloads: string,
				request: Pick<ShelveRequest, "kind" | "payload" | "shelfmark">
			) {
				const halves = yield* answer(root, "library");

				// A share that has dropped can read as an empty folder: never write into one.
				if (!HALVES.every(({ folder }) => halves.includes(folder))) {
					return yield* new StacksUnavailable({
						reason: "The library is empty: its share may have dropped",
					});
				}

				yield* answer(downloads, "downloads folder");

				const { folder } = request.kind === "text" ? HALVES[0] : HALVES[1];
				const extension = EXTENSIONS[request.kind];

				if (
					request.payload === "" ||
					request.payload.split("/").includes("..")
				) {
					return yield* new Unshelvable({
						reason:
							"Its files are not in a folder of their own in the downloads",
					});
				}

				const names = request.shelfmark.split("/");

				if (
					names.length !== 2 ||
					names.some((name) => ["", ".", ".."].includes(name))
				) {
					return yield* new Unshelvable({
						reason: `"${request.shelfmark}" is not an author's folder and a title's`,
					});
				}

				const editions = yield* editionsIn(
					path.join(downloads, request.payload),
					extension
				);

				const [edition] = editions;

				if (edition === undefined || editions.length > 1) {
					return yield* new Unshelvable({
						reason:
							edition === undefined
								? `It has no ${extension} file`
								: `It has ${editions.length} ${extension} files, and a shelf takes one`,
					});
				}

				const shelf = path.join(root, folder, request.shelfmark);
				const [author, title] = names;
				const file = `${title} - ${author}${extension}`;

				yield* fs.makeDirectory(shelf, { recursive: true });

				const bytes = Number((yield* fs.stat(edition)).size);
				const [held] = yield* firstFile(shelf, extension);

				// The same file, by name and size, is this copy, made before a restart cut its answer short.
				if (held !== undefined) {
					return held.file === file && held.bytes === bytes
						? held
						: yield* new Unshelvable({
								reason: `${request.shelfmark} already has ${held.file}`,
							});
				}

				// Under another name until it is whole, so a walk never finds half a file.
				const part = path.join(shelf, `.${file}.part`);

				yield* fs.copyFile(edition, part);
				yield* fs.rename(part, path.join(shelf, file));

				return { file, bytes };
			},
			Effect.catchTag("PlatformError", ({ message }) =>
				Effect.fail(
					new StacksUnavailable({ reason: `Copying it failed (${message})` })
				)
			)
		);

		return { survey, workIdOf, shelve };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}

import type { Heading } from "@prosody/domain/Reading/Copy";
import {
	Array,
	Context,
	Effect,
	FileSystem,
	Layer,
	Order,
	Schema,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

/** A PDF whose pages could not be drawn, and why, in words for the shelf. */
export class Undrawable extends Schema.TaggedError<Undrawable>()("Undrawable", {
	reason: Schema.String,
}) {}

/** A page picture's longer side, in pixels: sharp on a phone's screen, and on a laptop's. */
const SIZE = 1600;

/** What `pdftohtml` escapes in a title, and what it stands for. */
const ENTITIES = new Map([
	["amp", "&"],
	["lt", "<"],
	["gt", ">"],
	["#34", '"'],
]);

/** One line of `pdftohtml -xml`'s outline: a list opening or closing, or an entry in it. */
const OUTLINE =
	/<(?<close>\/)?outline>|<item page="(?<page>\d+)">(?<title>.*?)<\/item>/gu;

/**
 * The chapters a PDF's outline lists at its top level, from `pdftohtml -xml`'s answer. The entries
 * nested under them (sections, subsections) are left out, as a book's contents page leaves them out.
 */
export const headingsOf = (xml: string): ReadonlyArray<Heading> => {
	const headings: Array<Heading> = [];
	let depth = 0;

	for (const { groups } of xml.matchAll(OUTLINE)) {
		if (groups?.page === undefined) {
			depth += groups?.close === undefined ? 1 : -1;
		} else if (depth === 1) {
			headings.push({
				title: (groups.title ?? "").replaceAll(
					/&(?<name>amp|lt|gt|#34);/gu,
					(_entity, name: string) => ENTITIES.get(name) ?? ""
				),
				page: Number(groups.page),
			});
		}
	}

	return headings;
};

/**
 * Draws a PDF's pages with poppler, for a reading copy made of pages: a JPEG of each page, and the
 * chapters its outline lists.
 */
export class Pages extends Context.Service<
	Pages,
	{
		/** Draw every page into `folder`, and name the pictures in order. */
		readonly draw: (
			pdf: string,
			folder: string
		) => Effect.Effect<Array.NonEmptyReadonlyArray<string>, Undrawable>;
		/** The chapters its outline lists. A PDF with no outline, or one that can't be read, has none. */
		readonly headings: (pdf: string) => Effect.Effect<ReadonlyArray<Heading>>;
	}
>()("@prosody/press/Pages", {
	make: Effect.gen(function* () {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
		const fs = yield* FileSystem.FileSystem;

		const draw = Effect.fn("Pages.draw")(
			function* (pdf: string, folder: string) {
				yield* fs.makeDirectory(folder, { recursive: true });

				// Named page-001.jpg and on, padded to the same width, so their names sort in order.
				const exitCode = yield* spawner.exitCode(
					ChildProcess.make("pdftoppm", [
						"-scale-to",
						String(SIZE),
						"-jpeg",
						"-jpegopt",
						"quality=80",
						pdf,
						`${folder}/page`,
					])
				);

				if (exitCode !== 0) {
					return yield* new Undrawable({
						reason: `pdftoppm stopped drawing its pages (exit code ${exitCode})`,
					});
				}

				const pictures = Array.sort(
					yield* fs.readDirectory(folder),
					Order.String
				);

				return Array.isReadonlyArrayNonEmpty(pictures)
					? pictures
					: yield* new Undrawable({ reason: "it has no pages" });
			},
			Effect.catchTag("PlatformError", ({ message }) =>
				Effect.fail(new Undrawable({ reason: message }))
			)
		);

		// The first page alone is drawn as text; the outline comes whole whatever the pages asked.
		const headings = Effect.fn("Pages.headings")(
			function* (pdf: string) {
				const xml = yield* spawner.string(
					ChildProcess.make("pdftohtml", [
						"-xml",
						"-i",
						"-q",
						"-l",
						"1",
						"-stdout",
						pdf,
					])
				);

				return headingsOf(xml);
			},
			Effect.orElseSucceed((): ReadonlyArray<Heading> => [])
		);

		return { draw, headings };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}

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

export class Undrawable extends Schema.TaggedError<Undrawable>()("Undrawable", {
	reason: Schema.String,
}) {}

const SIZE = 1600;

const ENTITIES = new Map([
	["amp", "&"],
	["lt", "<"],
	["gt", ">"],
	["#34", '"'],
]);

const OUTLINE =
	/<(?<close>\/)?outline>|<item page="(?<page>\d+)">(?<title>.*?)<\/item>/gu;

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

export class Pages extends Context.Service<
	Pages,
	{
		readonly draw: (
			pdf: string,
			folder: string
		) => Effect.Effect<Array.NonEmptyReadonlyArray<string>, Undrawable>;
		readonly headings: (pdf: string) => Effect.Effect<ReadonlyArray<Heading>>;
	}
>()("@prosody/press/Pages", {
	make: Effect.gen(function* () {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
		const fs = yield* FileSystem.FileSystem;

		const draw = Effect.fn("Pages.draw")(
			function* (pdf: string, folder: string) {
				yield* fs.makeDirectory(folder, { recursive: true });

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

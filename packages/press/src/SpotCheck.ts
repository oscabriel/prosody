import {
	Array,
	Context,
	Effect,
	FileSystem,
	Layer,
	Option,
	Order,
	Path,
	Schema,
} from "effect";
import type { PlatformError } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

/** One sentence the aligner matched: where its text is, and where it is in the audio. */
export interface Sighting {
	readonly id: string;
	readonly page: string;
	readonly begin: number;
	readonly end: number;
}

/** What a spot check found: how many sentences it listened to, and how many it heard right. */
export interface Heard {
	readonly checked: number;
	readonly heard: number;
}

/** How many sentences a check listens to. Spike 1 found 40 enough to tell a good book from a bad one. */
const CLIPS = 40;

/** A clip shorter than this is too short to judge, and longer is likely a sentence whose end ran on. */
const SHORTEST = 3;

const LONGEST = 15;

/** How alike a sentence and what was heard must be to count as heard right. */
const ALIKE = 0.8;

/** One `<par>` of a media overlay: a sentence, its page, and its clip of audio. */
const PAR =
	/<par id="(?<id>[^"]+)" epub:type="storyteller:(?<kind>\w+)">\s*<text src="(?<page>[^"#]+)#[^"]+"\s*\/>\s*<audio src="[^"]+" clipBegin="(?<begin>[\d.]+)s" clipEnd="(?<end>[\d.]+)s"\s*\/>\s*<\/par>/gu;

/** The matched sentences of one overlay. Pages are named as the overlay names them, from its folder. */
export const matchedIn = (overlay: string): Array<Sighting> =>
	Array.flatMap([...overlay.matchAll(PAR)], ({ groups }) =>
		groups?.kind === "matched"
			? [
					{
						id: groups.id ?? "",
						page: groups.page ?? "",
						begin: Number(groups.begin),
						end: Number(groups.end),
					},
				]
			: []
	);

/** The words of a text, lower case, with curly apostrophes made straight. */
export const wordsOf = (text: string): Array<string> =>
	text
		.toLowerCase()
		.replaceAll("’", "'")
		.match(/[a-z0-9']+/gu) ?? [];

/**
 * A sentence's text in a page. Sentence spans hold inline markup but not one another, so the next
 * span with an id ends this one.
 */
export const sentenceIn = (page: string, id: string): string => {
	const at = page.indexOf(`id="${id}"`);

	if (at === -1) {
		return "";
	}

	const start = page.indexOf(">", at) + 1;
	const next = page.indexOf('<span id="', start);
	const markup = page.slice(start, next === -1 ? start + 4000 : next);

	return markup
		.replaceAll(/<[^>]+>/gu, "")
		.replaceAll(/&#?\w+;/gu, " ")
		.trim();
};

/** How alike two lists of words are, from 0 to 1: twice their longest common run over their lengths. */
export const likeness = (
	said: ReadonlyArray<string>,
	heard: ReadonlyArray<string>
): number => {
	if (said.length + heard.length === 0) {
		return 1;
	}

	let previous: Array<number> = Array.makeBy(heard.length + 1, () => 0);

	for (const word of said) {
		const row = [0];

		for (const [index, other] of heard.entries()) {
			row.push(
				word === other
					? (previous[index] ?? 0) + 1
					: Math.max(previous[index + 1] ?? 0, row[index] ?? 0)
			);
		}

		previous = row;
	}

	return (2 * (previous.at(-1) ?? 0)) / (said.length + heard.length);
};

/** `count` items spread evenly through `items`, so a check hears the whole book. */
export const spread = <A>(items: ReadonlyArray<A>, count: number): Array<A> =>
	items.length <= count
		? [...items]
		: Array.makeBy(
				count,
				(index) => items[Math.floor((index * items.length) / count)]
			).filter((item): item is A => item !== undefined);

/** What whisper.cpp writes for each clip. */
const Transcript = Schema.Struct({ transcript: Schema.String });

const decodeTranscript = Schema.decodeUnknownEffect(
	Schema.fromJsonString(Transcript)
);

/**
 * A spot check: listen to a spread of matched sentences with a second speech model, and count those
 * it heard right. `book` is the aligned EPUB, unzipped; `audio` is the one audio file it was aligned
 * with; `folder` is somewhere to work, emptied first.
 */
export class SpotCheck extends Context.Service<
	SpotCheck,
	{
		readonly listen: (
			book: string,
			audio: string,
			folder: string
		) => Effect.Effect<Heard, PlatformError.PlatformError>;
	}
>()("@prosody/press/SpotCheck", {
	make: Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

		const listen = Effect.fn("SpotCheck.listen")(function* (
			book: string,
			audio: string,
			folder: string
		) {
			const overlays = Array.filter(
				yield* fs.readDirectory(book, { recursive: true }),
				(name) => name.endsWith(".smil")
			);

			const candidates: Array<Sighting> = [];

			for (const overlay of Array.sort(overlays, Order.String)) {
				const here = path.dirname(path.join(book, overlay));

				for (const sighting of matchedIn(
					yield* fs.readFileString(path.join(book, overlay))
				)) {
					const length = sighting.end - sighting.begin;

					if (length >= SHORTEST && length <= LONGEST) {
						candidates.push({
							...sighting,
							page: path.join(here, sighting.page),
						});
					}
				}
			}

			const chosen = spread(candidates, CLIPS);
			const clips = path.join(folder, "clips");
			const transcripts = path.join(folder, "heard");

			yield* fs.remove(folder, { recursive: true, force: true });
			yield* fs.makeDirectory(clips, { recursive: true });

			for (const [index, clip] of chosen.entries()) {
				yield* spawner.exitCode(
					ChildProcess.make("ffmpeg", [
						"-v",
						"error",
						"-y",
						"-ss",
						`${clip.begin}`,
						"-to",
						`${clip.end}`,
						"-i",
						audio,
						"-ac",
						"1",
						"-ar",
						"16000",
						path.join(clips, `${index}.wav`),
					])
				);
			}

			yield* spawner.exitCode(
				ChildProcess.make("align", [
					"transcribe",
					"--engine",
					"whisper.cpp",
					"--model",
					"base.en",
					"--language",
					"en",
					"--no-progress",
					"--log-level",
					"error",
					clips,
					transcripts,
				])
			);

			let heard = 0;

			for (const [index, clip] of chosen.entries()) {
				const said = sentenceIn(yield* fs.readFileString(clip.page), clip.id);

				const transcript = yield* fs
					.readFileString(path.join(transcripts, `${index}.json`))
					.pipe(
						Effect.flatMap(decodeTranscript),
						Effect.map((decoded) => decoded.transcript),
						Effect.option
					);

				const score = likeness(
					wordsOf(said),
					wordsOf(Option.getOrElse(transcript, () => ""))
				);

				heard += score >= ALIKE ? 1 : 0;
			}

			return { checked: chosen.length, heard } satisfies Heard;
		});

		return { listen };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}

import { Contents } from "@prosody/domain/Reading/Copy";
import { Effect, Option, Schema, Stream } from "effect";
import { Command } from "foldkit";
import { modifyFields } from "foldkit/struct";

import { bodyOf, copyUrl, filesOf, kindOf } from "./Copy.ts";
import { DeviceCopy, Message } from "./Model.ts";
import type { Copying, DeviceCopies, Model } from "./Model.ts";
import { cacheOf, PIECE, pieceOf, recordOf, workOfCache } from "./OnDevice.ts";
import { entryOf } from "./Steps.ts";
import type { Return } from "./Steps.ts";

class CopyFailed extends Schema.TaggedError<CopyFailed>()("CopyFailed", {
	reason: Schema.String,
}) {}

const attempt = <A>(run: () => Promise<A>) =>
	Effect.tryPromise({
		try: run,
		catch: (cause) =>
			new CopyFailed({
				reason: cause instanceof Error ? cause.message : String(cause),
			}),
	});

const RecordJson = Schema.fromJsonString(DeviceCopy);

const ContentsJson = Schema.fromJsonString(Contents);

const recordIn = (work: string) =>
	attempt(async () => {
		const record = await caches.match(recordOf(work));

		return record === undefined ? undefined : await record.text();
	}).pipe(
		Effect.map((json) =>
			Option.flatMap(Option.fromUndefinedOr(json), (text) =>
				Schema.decodeOption(RecordJson)(text)
			)
		)
	);

export const savedCopies = Effect.gen(function* () {
	const names = yield* attempt(async () => await caches.keys());
	const copies: Record<string, DeviceCopy> = {};

	for (const name of names) {
		const work = workOfCache(name);
		const record = work === undefined ? Option.none() : yield* recordIn(work);

		if (work !== undefined && Option.isSome(record)) {
			copies[work] = record.value;
		}
	}

	return copies satisfies DeviceCopies;
}).pipe(Effect.orElseSucceed((): DeviceCopies => ({})));

const keepText = (cache: Cache, work: string) =>
	Effect.gen(function* () {
		const contentsUrl = copyUrl(work, "contents.json");

		yield* attempt(async () => {
			await cache.add(contentsUrl);
		});

		const json = yield* attempt(async () => {
			const response = await cache.match(contentsUrl);

			return (await response?.text()) ?? "";
		});

		const contents = Schema.decodeOption(ContentsJson)(json);

		if (Option.isNone(contents)) {
			return yield* new CopyFailed({
				reason: "its contents could not be read",
			});
		}

		const { cover, sections: listed, pictures } = contents.value;

		const timeline =
			kindOf(contents.value) === "synced"
				? [copyUrl(work, "timeline.json")]
				: [];

		const covers = cover === null ? [] : [copyUrl(work, cover)];

		const sections = listed.map((section) =>
			copyUrl(work, `text/${section.path}`)
		);

		const printed = pictures.map((picture) =>
			copyUrl(work, `pictures/${picture}`)
		);

		yield* attempt(async () => {
			await cache.addAll([...timeline, ...covers, ...sections]);
		});

		yield* Effect.forEach(
			printed,
			(picture) =>
				attempt(async () => {
					if ((await cache.match(picture)) === undefined) {
						await cache.add(picture);
					}
				}),
			{ concurrency: 6 }
		);

		const shown = yield* Effect.forEach(
			sections,
			(section) =>
				attempt(async () => {
					const response = await cache.match(section);
					const xhtml = (await response?.text()) ?? "";

					return filesOf(bodyOf(xhtml, new URL(section, location.origin).href));
				}),
			{ concurrency: 1 }
		);

		const files = [
			...new Set(
				shown.flat().filter((file) => file.startsWith(`/copies/${work}/`))
			),
		];

		yield* attempt(async () => {
			await cache.addAll(files);
		});

		return contents.value;
	});

const keptSize = (cache: Cache) =>
	attempt(async () => {
		const responses = await cache.matchAll();

		const blobs = await Promise.all(
			responses.map(async (response) => await response.blob())
		);

		return blobs.reduce((sum, blob) => sum + blob.size, 0);
	});

const audioSize = (audio: string) =>
	attempt(async () => {
		const response = await fetch(audio, { headers: { range: "bytes=0-0" } });
		const size = Number(response.headers.get("content-range")?.split("/")[1]);

		if (response.status !== 206 || !Number.isFinite(size)) {
			throw new Error(`the audio answered ${response.status}`);
		}

		return size;
	});

const keepPiece = (cache: Cache, audio: string, index: number, size: number) =>
	attempt(async () => {
		const key = pieceOf(audio, index);

		if ((await cache.match(key)) !== undefined) {
			return;
		}

		const from = index * PIECE;
		const to = Math.min(size, from + PIECE) - 1;

		const response = await fetch(audio, {
			headers: { range: `bytes=${from}-${to}` },
		});

		if (response.status !== 206) {
			throw new Error(`the audio answered ${response.status}`);
		}

		await cache.put(
			key,
			new Response(await response.blob(), { headers: response.headers })
		);
	});

export const keepCopy = (
	work: string,
	title: string,
	author: string
): Stream.Stream<Message> =>
	Stream.unwrap(
		Effect.gen(function* () {
			const cache = yield* attempt(
				async () => await caches.open(cacheOf(work))
			);

			yield* attempt(async () => await navigator.storage.persist());

			const contents = yield* keepText(cache, work);

			const record = (bytes: number) => {
				const copy = { title, author, bytes };

				return attempt(async () => {
					await cache.put(recordOf(work), Response.json(copy));
				}).pipe(Effect.as(Message.KeptCopy({ work, copy })));
			};

			if (contents.audio === null) {
				return Stream.fromEffect(record(yield* keptSize(cache)));
			}

			const audio = copyUrl(
				work,
				`audio/${encodeURIComponent(contents.audio)}`
			);

			const size = yield* audioSize(audio);

			const pieces = Stream.range(0, Math.ceil(size / PIECE) - 1).pipe(
				Stream.mapEffect((index) =>
					keepPiece(cache, audio, index, size).pipe(
						Effect.as(
							Message.CopiedPart({
								work,
								done: Math.min(size, (index + 1) * PIECE),
								of: size,
							})
						)
					)
				)
			);

			return Stream.concat(pieces, Stream.fromEffect(record(size)));
		})
	).pipe(
		Stream.catchTag("CopyFailed", ({ reason }) =>
			Stream.succeed(Message.FailedCopy({ work, reason }))
		)
	);

export const RemoveCopy = Command.define("RemoveCopy", {
	args: { work: Schema.String },
	messages: [Message.RemovedCopy],
	execute: ({ work }) =>
		attempt(async () => await caches.delete(cacheOf(work))).pipe(
			Effect.ignore,
			Effect.as(Message.RemovedCopy({ work }))
		),
});

export const startCopy = (model: Model): Return =>
	Option.match(model.room, {
		onNone: () => ({ model }),
		onSome: ({ work }) => {
			if (Option.exists(model.copying, ({ problem }) => problem === null)) {
				return { model };
			}

			const entry = Option.getOrUndefined(entryOf(model, work));

			return {
				model: modifyFields(model, {
					copying: () =>
						Option.some({
							work,
							title: entry?.title ?? "",
							author: entry?.author ?? "",
							done: 0,
							of: 0,
							problem: null,
						}),
				}),
			};
		},
	});

export const changeCopying = (
	model: Model,
	work: string,
	change: (copying: Copying) => Copying
): Return => ({
	model: modifyFields(model, {
		copying: () =>
			Option.map(model.copying, (copying) =>
				copying.work === work ? change(copying) : copying
			),
	}),
});

export const keptCopy = (
	model: Model,
	work: string,
	copy: DeviceCopy
): Return => ({
	model: modifyFields(model, {
		copies: () => ({ ...model.copies, [work]: copy }),
		copying: () => Option.none(),
	}),
});

export const removeCopy = (model: Model): Return =>
	Option.match(model.room, {
		onNone: () => ({ model }),
		onSome: ({ work }) => ({
			model: modifyFields(model, {
				copying: () =>
					Option.filter(model.copying, (copying) => copying.work !== work),
			}),
			commands: [RemoveCopy({ work })],
		}),
	});

export const withoutCopy = (model: Model, work: string): Return => ({
	model: modifyFields(model, {
		copies: () =>
			Object.fromEntries(
				Object.entries(model.copies).filter(([id]) => id !== work)
			),
	}),
});

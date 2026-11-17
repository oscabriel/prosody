import * as Docker from "@alchemy.run/docker";
import { Shelfmark } from "@prosody/domain/Library/Shelfmark";
import { WorkId } from "@prosody/domain/Library/Work.id";
import { PressApi } from "@prosody/domain/PressApi.api";
import { API_ALIAS, Front } from "@prosody/server/Front";
import { ServerHost } from "alchemy/Runtime/Process";
import { Array, DateTime, Effect, Layer, Option, Ref, Schedule } from "effect";
import { Digest } from "effect/crypto";
import { HttpServerResponse } from "effect/http";

import type { Book } from "./Stacks.ts";
import { Stacks } from "./Stacks.ts";

/** The library, as the host mounts it. Mounted into the press read-only. */
const LIBRARY = "/mnt/media/books";

/** What the last walk did, for `docker service logs` and the press's own page. */
interface Report {
	readonly at: string;
	readonly works: number;
	readonly refused: ReadonlyArray<string>;
	readonly unreadable: ReadonlyArray<string>;
}

/** The walk's own services. The press's container already provides the file system. */
const StacksLive = Stacks.layer.pipe(Layer.provide(Digest.layerWebCrypto));

/**
 * The press: the one service that touches book files. For now it only reads: it walks the library
 * and reports each work and edition to the model, which decides what that changes.
 */
export default class Press extends Docker.Service<Press>()(
	"Press",
	Effect.gen(function* () {
		const front = yield* Front;

		return {
			main: import.meta.url,
			port: 3000,
			networks: [{ name: front.name }],
			volumes: [
				{ hostPath: LIBRARY, containerPath: "/library", readOnly: true },
			],
		};
	}),
	Effect.gen(function* () {
		const host = yield* ServerHost;
		const stacks = yield* Stacks;
		const last = yield* Ref.make(Option.none<Report>());

		/** Tell the model about one book. Sending the same book again changes nothing. */
		const report = Effect.fn("Press.report")(function* (book: Book) {
			const model = yield* PressApi.clientHttp(
				`http://${API_ALIAS}:3000/press`
			);

			const id = WorkId.make(yield* stacks.workIdOf(book.shelfmark));

			yield* model.CatalogueWork(id, {
				title: book.title,
				author: book.author,
				shelfmark: Shelfmark.make(book.shelfmark),
			});

			for (const kind of ["text", "audio"] as const) {
				const found = book[kind];

				if (Option.isSome(found)) {
					yield* model.ShelveEdition(id, { kind, ...found.value });
				}
			}
		}, Effect.scoped);

		/** Report one book, and name it if the model refused it. */
		const refusalOf = (book: Book) =>
			report(book).pipe(
				Effect.tapError(Effect.logWarning),
				Effect.match({
					onFailure: (refusal) =>
						Option.some(`${book.shelfmark}: ${refusal._tag}`),
					onSuccess: () => Option.none(),
				})
			);

		/** Walk the library once and report everything in it. */
		const walk = Effect.fn("Press.walk")(function* () {
			const { books, unreadable } = yield* stacks.survey("/library");
			const refused = Array.getSomes(yield* Effect.forEach(books, refusalOf));
			const at = DateTime.formatIso(yield* DateTime.now);
			const done = { at, works: books.length, refused, unreadable };

			yield* Ref.set(last, Option.some(done));
			yield* Effect.log("walked the library", done);
		});

		yield* host.run(
			walk().pipe(Effect.repeat(Schedule.spaced("5 minutes")), Effect.asVoid)
		);

		return {
			fetch: Effect.flatMap(Ref.get(last), (latest) =>
				HttpServerResponse.json(Option.getOrNull(latest))
			).pipe(Effect.orDie),
		};
	}).pipe(Effect.provide(StacksLive))
) {}

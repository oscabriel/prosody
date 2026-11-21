import * as Docker from "@alchemy.run/docker";
import * as Cluster from "@alchemy.run/effect-cluster";
import { Shelfmark } from "@prosody/domain/Library/Shelfmark";
import { ShelveRequest } from "@prosody/domain/Library/Stacks.external";
import { WorkId } from "@prosody/domain/Library/Work.id";
import { AlignRequest } from "@prosody/domain/Narration/Aligner.external";
import { PressApi } from "@prosody/domain/PressApi.api";
import { CopyRequest } from "@prosody/domain/Reading/Copier.external";
import { editionToCopy } from "@prosody/domain/Reading/CopyEdition.command";
import { API_ALIAS, Front, PRESS_ALIAS } from "@prosody/server/Front";
import {
	copiesOnHost,
	downloadsOnHost,
	libraryOnHost,
	pressUser,
} from "@prosody/server/Host";
import { Database } from "@prosody/server/ProsodyLive";
import { QBittorrentSettings } from "@prosody/server/QBittorrent";
import { sourceFingerprint } from "@prosody/server/Source";
import { ServerHost } from "alchemy/Runtime/Process";
import {
	Array,
	DateTime,
	Effect,
	Layer,
	Option,
	Queue,
	Ref,
	Schedule,
} from "effect";
import { Digest } from "effect/crypto";
import {
	FetchHttpClient,
	HttpServerRequest,
	HttpServerResponse,
} from "effect/http";

import { isCopy, Pending } from "./Pending.ts";
import { COPIES, LIBRARY, ReadingCopies } from "./ReadingCopies.ts";
import type { Book } from "./Stacks.ts";
import { Stacks } from "./Stacks.ts";
import { watchDownloads } from "./Watch.ts";

const DOWNLOADS = "/downloads";

const IMAGE = "pages-1";

const PressImage = Effect.gen(function* () {
	const uid = yield* pressUser;

	return yield* Docker.Image("PressImage", {
		tag: uid === "1000" ? IMAGE : `${IMAGE}-uid${uid}`,
		build: { context: "packages/press/image", args: { PRESS_UID: uid } },
	});
});

const persistently = <A, E, R>(answer: Effect.Effect<A, E, R>) =>
	Effect.retry(answer, { schedule: Schedule.spaced("10 seconds"), times: 30 });

interface Report {
	readonly at: string;
	readonly works: number;
	readonly refused: ReadonlyArray<string>;
	readonly unreadable: ReadonlyArray<string>;
}

const PressLive = Layer.mergeAll(
	Stacks.layer,
	ReadingCopies.layer,
	Pending.layer
).pipe(Layer.provide(Digest.layerWebCrypto));

const freshConnections = Effect.provideService(FetchHttpClient.RequestInit, {
	keepalive: false,
});

export default class Press extends Docker.Service<Press>()(
	"Press",
	Effect.gen(function* () {
		const database = yield* Cluster.Database.Database;
		const front = yield* Front;
		const image = yield* PressImage;

		const clusterNetworks =
			database.network?.kind === "docker"
				? [{ name: database.network.name, aliases: [PRESS_ALIAS] }]
				: [];

		return {
			main: import.meta.url,
			image: image.imageRef,
			port: 3000,
			build: { input: { external: ["@huggingface/transformers"] } },
			environment: {
				PROSODY_SOURCE: yield* sourceFingerprint,
				PROSODY_ALIGNER_MODELS: "/models",
			},
			networks: [{ name: front.name }, ...clusterNetworks],
			volumes: [
				{ hostPath: yield* libraryOnHost, containerPath: LIBRARY },
				{
					hostPath: yield* downloadsOnHost,
					containerPath: DOWNLOADS,
					readOnly: true,
				},
				{ hostPath: yield* copiesOnHost, containerPath: COPIES },
			],
		};
	}).pipe(Effect.provide(Database)),
	Effect.gen(function* () {
		const host = yield* ServerHost;
		const stacks = yield* Stacks;
		const copies = yield* ReadingCopies;
		const last = yield* Ref.make(Option.none<Report>());
		const pending = yield* Pending;

		yield* Effect.orDie(QBittorrentSettings);

		const model = PressApi.clientHttp(`http://${API_ALIAS}:3000/press`);

		const report = Effect.fn("Press.report")(function* (book: Book) {
			const press = yield* model;
			const named = WorkId.make(yield* stacks.workIdOf(book.shelfmark));
			const shelfmark = Shelfmark.make(book.shelfmark);

			const id = yield* press.ClaimShelfmark(shelfmark, { work: named }).pipe(
				Effect.as(named),
				Effect.catchTag("ShelfmarkTaken", ({ work }) => Effect.succeed(work))
			);

			yield* press.CatalogueWork(id, {
				title: book.title,
				author: book.author,
				shelfmark,
				description: null,
			});

			for (const kind of ["text", "audio", "pages"] as const) {
				const found = book[kind];

				if (Option.isSome(found)) {
					yield* press.ShelveEdition(id, { kind, ...found.value });
				}
			}

			if (Option.isSome(book.text) && Option.isSome(book.audio)) {
				yield* press.PairEditions(id, {
					shelfmark,
					text: book.text.value.file,
					audio: book.audio.value.file,
				});

				return;
			}

			const kind = editionToCopy((each) => Option.isSome(book[each]));

			if (kind !== undefined) {
				const found = book[kind];

				if (Option.isSome(found)) {
					yield* press.CopyEdition(id, { shelfmark, kind, ...found.value });
				}
			}
		}, Effect.scoped);

		const refusalOf = (book: Book) =>
			report(book).pipe(
				Effect.tapError(Effect.logWarning),
				Effect.match({
					onFailure: (refusal) =>
						Option.some(`${book.shelfmark}: ${refusal._tag}`),
					onSuccess: () => Option.none(),
				})
			);

		const walk = Effect.fn("Press.walk")(function* () {
			const { books, unreadable } = yield* stacks.walk(LIBRARY);

			const refused = Array.getSomes(
				yield* Effect.forEach(books, refusalOf, { concurrency: 1 })
			);

			const at = DateTime.formatIso(yield* DateTime.now);
			const done = { at, works: books.length, refused, unreadable };

			yield* Ref.set(last, Option.some(done));
			yield* Effect.log("walked the library", done);
		});

		const align = Effect.fn("Press.align")(function* (request: AlignRequest) {
			const press = yield* model;
			const { work, attempt } = request;

			yield* Effect.log("aligning", { shelfmark: request.shelfmark, attempt });

			yield* copies.make(request).pipe(
				Effect.matchEffect({
					onSuccess: (aligned) =>
						Effect.tap(
							press.RecordAlignment(work, { attempt, ...aligned }),
							() =>
								Effect.log("aligned", {
									shelfmark: request.shelfmark,
									...aligned,
								})
						),
					onFailure: ({ reason }) =>
						Effect.tap(
							press.RecordAlignmentFailed(work, { attempt, reason }),
							() =>
								Effect.logWarning("not aligned", {
									shelfmark: request.shelfmark,
									reason,
								})
						),
				})
			);

			yield* pending.done(request);
		}, Effect.scoped);

		const copy = Effect.fn("Press.copy")(function* (request: CopyRequest) {
			const press = yield* model;
			const { work, attempt } = request;
			const about = { shelfmark: request.shelfmark, kind: request.kind };

			yield* Effect.log("copying", { ...about, attempt });

			yield* copies.copy(request).pipe(
				Effect.matchEffect({
					onSuccess: (copied) =>
						Effect.tap(
							persistently(press.RecordCopy(work, { attempt, ...copied })),
							() => Effect.log("copied", { ...about, ...copied })
						),
					onFailure: ({ reason }) =>
						Effect.tap(
							persistently(press.RecordCopyFailed(work, { attempt, reason })),
							() => Effect.logWarning("not copied", { ...about, reason })
						),
				})
			);

			yield* pending.done(request);
		}, Effect.scoped);

		const shelve = Effect.fn("Press.shelve")(function* (
			request: ShelveRequest
		) {
			const press = yield* model;
			const { grab, work, shelfmark } = request;
			const about = { shelfmark, payload: request.payload };

			yield* Effect.log("shelving", about);

			yield* stacks.shelve(LIBRARY, DOWNLOADS, request).pipe(
				Effect.tapErrorTag("StacksUnavailable", ({ reason }) =>
					Effect.andThen(
						Effect.logWarning("waiting for the library", reason),
						persistently(press.RecordNotShelved(grab, { reason })).pipe(
							Effect.ignore
						)
					)
				),
				Effect.flatMap((shelved) =>
					Effect.andThen(
						persistently(press.RecordShelved(grab, { work, shelfmark })),
						Effect.andThen(
							Effect.log("shelved", { ...about, ...shelved }),
							walk()
						)
					)
				),
				Effect.catchTag("Unshelvable", ({ reason }) =>
					Effect.andThen(
						persistently(press.RecordNotShelved(grab, { reason })),
						Effect.logWarning("not shelved", { ...about, reason })
					)
				)
			);

			yield* pending.done(request);
		}, Effect.scoped);

		yield* host.run(
			walk().pipe(
				Effect.repeat(Schedule.spaced("5 minutes")),
				Effect.asVoid,
				freshConnections
			)
		);

		yield* host.run(
			Effect.scoped(Effect.flatMap(model, watchDownloads)).pipe(
				Effect.catchCause(Effect.logWarning),
				Effect.repeat(Schedule.spaced("1 minute")),
				Effect.asVoid,
				freshConnections
			)
		);

		yield* host.run(
			Queue.take(pending.shelving).pipe(
				Effect.flatMap((request) =>
					shelve(request).pipe(
						Effect.catchTag("StacksUnavailable", () =>
							Effect.forkDetach(
								Effect.delay(
									Queue.offer(pending.shelving, request),
									"5 minutes"
								)
							)
						),
						Effect.catchCause(Effect.logError)
					)
				),
				Effect.forever,
				freshConnections
			)
		);

		yield* host.run(
			pending.resume.pipe(
				Effect.orDie,
				Effect.andThen(
					Queue.take(pending.waiting).pipe(
						Effect.flatMap((request) =>
							(isCopy(request) ? copy(request) : align(request)).pipe(
								Effect.catchCause(Effect.logError)
							)
						),
						Effect.forever
					)
				),
				freshConnections
			)
		);

		return {
			fetch: Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest;
				const route = new URL(request.url, "http://localhost").pathname;

				if (request.method === "POST" && route === "/align") {
					yield* pending.enqueue(
						yield* HttpServerRequest.schemaBodyJson(AlignRequest)
					);

					return HttpServerResponse.empty({ status: 202 });
				}

				if (request.method === "POST" && route === "/copy") {
					yield* pending.enqueue(
						yield* HttpServerRequest.schemaBodyJson(CopyRequest)
					);

					return HttpServerResponse.empty({ status: 202 });
				}

				if (request.method === "POST" && route === "/shelve") {
					yield* pending.enqueue(
						yield* HttpServerRequest.schemaBodyJson(ShelveRequest)
					);

					return HttpServerResponse.empty({ status: 202 });
				}

				return yield* HttpServerResponse.json(
					Option.getOrNull(yield* Ref.get(last))
				);
			}).pipe(Effect.orDie),
		};
	}).pipe(Effect.provide(PressLive))
) {}

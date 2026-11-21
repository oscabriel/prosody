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

/** Where the press's container sees the downloads. */
const DOWNLOADS = "/downloads";

/** Bump this whenever `image/Dockerfile` changes: the press is rebuilt only when the tag moves. */
const IMAGE = "pages-1";

/**
 * The press's base image: Bun, ffmpeg, poppler, the speech models and the library that runs them,
 * made for the user the press runs as. A user other than 1000 has an image of their own.
 */
const PressImage = Effect.gen(function* () {
	const uid = yield* pressUser;

	return yield* Docker.Image("PressImage", {
		tag: uid === "1000" ? IMAGE : `${IMAGE}-uid${uid}`,
		build: { context: "packages/press/image", args: { PRESS_UID: uid } },
	});
});

/**
 * Send an answer to the model until it is heard, for five minutes: long enough for a deploy to
 * replace the Api.
 */
const persistently = <A, E, R>(answer: Effect.Effect<A, E, R>) =>
	Effect.retry(answer, { schedule: Schedule.spaced("10 seconds"), times: 30 });

/** What the last walk did, for `docker service logs` and the press's own page. */
interface Report {
	readonly at: string;
	readonly works: number;
	readonly refused: ReadonlyArray<string>;
	readonly unreadable: ReadonlyArray<string>;
}

/** The walk's and the workshop's own services. The container provides files and processes. */
const PressLive = Layer.mergeAll(
	Stacks.layer,
	ReadingCopies.layer,
	Pending.layer
).pipe(Layer.provide(Digest.layerWebCrypto));

/**
 * A new connection for every call to the model. While a deploy replaces the Api, the Api's address
 * reaches the press's own server, inside its own container; Bun would keep that connection open and
 * send it every later call, long after the Api is back. `keepalive: false` stops Bun reusing it.
 */
const freshConnections = Effect.provideService(FetchHttpClient.RequestInit, {
	keepalive: false,
});

/**
 * The press: the one service that touches book files, and the library's one writer. It walks the
 * library and reports each work, edition, pair and edition alone to the model, which decides what
 * that changes. When the model asks, it makes a reading copy, one at a time, and shelves a payload,
 * and reports how that went. It watches qBittorrent, and reports how each grab's download goes.
 */
export default class Press extends Docker.Service<Press>()(
	"Press",
	Effect.gen(function* () {
		const database = yield* Cluster.Database.Database;
		const front = yield* Front;
		const image = yield* PressImage;

		// The runner asks the press to align a pair over the cluster's own network.
		const clusterNetworks =
			database.network?.kind === "docker"
				? [{ name: database.network.name, aliases: [PRESS_ALIAS] }]
				: [];

		return {
			main: import.meta.url,
			image: image.imageRef,
			port: 3000,
			// The speech models' runtime loads a native library, so it is installed in the image and
			// left out of the bundle.
			build: { input: { external: ["@huggingface/transformers"] } },
			environment: {
				PROSODY_SOURCE: yield* sourceFingerprint,
				PROSODY_ALIGNER_MODELS: "/models",
			},
			networks: [{ name: front.name }, ...clusterNetworks],
			volumes: [
				// The library is mounted writable, for shelving; the downloads are only ever read.
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

		// Read as the press is built, so the deploy gives the press qBittorrent's settings.
		yield* Effect.orDie(QBittorrentSettings);

		/** The model's door for the press. */
		const model = PressApi.clientHttp(`http://${API_ALIAS}:3000/press`);

		/**
		 * Tell the model about one book. Sending the same book again changes nothing. Its work is the
		 * one that holds its folder: a work you wanted, shelved there, or else the work named for the
		 * folder, which claims it.
		 */
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

			// A work with no pair is read or heard by one edition alone.
			const kind = editionToCopy((each) => Option.isSome(book[each]));

			if (kind !== undefined) {
				const found = book[kind];

				if (Option.isSome(found)) {
					yield* press.CopyEdition(id, { shelfmark, kind, ...found.value });
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
			const { books, unreadable } = yield* stacks.walk(LIBRARY);

			const refused = Array.getSomes(
				yield* Effect.forEach(books, refusalOf, { concurrency: 1 })
			);

			const at = DateTime.formatIso(yield* DateTime.now);
			const done = { at, works: books.length, refused, unreadable };

			yield* Ref.set(last, Option.some(done));
			yield* Effect.log("walked the library", done);
		});

		/** Make one reading copy, and tell the model how it went. */
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

		/** Make the copy of an edition alone, and tell the model how it went. A copy has no deadline. */
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

		/**
		 * Shelve a payload, and tell the model how it went. While the library or the downloads don't
		 * answer, nothing is written: the model is told why, and it fails with `StacksUnavailable`, to
		 * be tried again. Once it is shelved, a walk reports its work, so a pair aligns at once.
		 */
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

		// Every minute, how each grab's download goes. qBittorrent down is a minute without news.
		yield* host.run(
			Effect.scoped(Effect.flatMap(model, watchDownloads)).pipe(
				Effect.catchCause(Effect.logWarning),
				Effect.repeat(Schedule.spaced("1 minute")),
				Effect.asVoid,
				freshConnections
			)
		);

		// Payloads are shelved one at a time, beside the reading copies, so a copy into the library
		// never waits behind an hour of aligning. One the library or the downloads can't take yet goes
		// back in line five minutes later, so the payloads behind it go on.
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

		// Like the walk, the worker runs only in the container: Alchemy also runs this setup on your
		// machine when it plans a deploy, where /copies doesn't exist. Without its folder the press can
		// do nothing, so it stops there and says why. Then one reading copy at a time, since the aligner
		// uses every core it is given. A failure to report is logged: a pair's deadline covers its try,
		// and a copy's answer has been sent again for five minutes by then.
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

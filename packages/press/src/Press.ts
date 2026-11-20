import * as Docker from "@alchemy.run/docker";
import * as Cluster from "@alchemy.run/effect-cluster";
import { Shelfmark } from "@prosody/domain/Library/Shelfmark";
import { WorkId } from "@prosody/domain/Library/Work.id";
import { AlignRequest } from "@prosody/domain/Narration/Aligner.external";
import { PressApi } from "@prosody/domain/PressApi.api";
import { COPIES_ON_HOST } from "@prosody/server/Copies";
import { API_ALIAS, Front, PRESS_ALIAS } from "@prosody/server/Front";
import { Database } from "@prosody/server/ProsodyLive";
import { sourceFingerprint } from "@prosody/server/Source";
import { ServerHost } from "alchemy/Runtime/Process";
import {
	Array,
	DateTime,
	Effect,
	FileSystem,
	HashSet,
	Layer,
	Option,
	Path,
	Queue,
	Ref,
	Schedule,
	Schema,
} from "effect";
import { Digest } from "effect/crypto";
import { HttpServerRequest, HttpServerResponse } from "effect/http";

import { COPIES, LIBRARY, ReadingCopies } from "./ReadingCopies.ts";
import type { Book } from "./Stacks.ts";
import { Stacks } from "./Stacks.ts";

/** The library, as the host mounts it. Mounted into the press read-only. */
const LIBRARY_ON_HOST = "/mnt/media/books";

/**
 * The press's base image: Bun, ffmpeg, the speech models and the library that runs them. Bump the
 * tag whenever `image/Dockerfile` changes; the press is rebuilt on top of it only when the tag moves.
 */
const PressImage = Docker.Image("PressImage", {
	tag: "aligner-1",
	build: { context: "packages/press/image" },
});

/** A request as the press keeps it on disk until it has answered. */
const decodeRequest = Schema.decodeUnknownEffect(
	Schema.fromJsonString(AlignRequest)
);

const encodeRequest = Schema.encodeEffect(Schema.fromJsonString(AlignRequest));

/** What the last walk did, for `docker service logs` and the press's own page. */
interface Report {
	readonly at: string;
	readonly works: number;
	readonly refused: ReadonlyArray<string>;
	readonly unreadable: ReadonlyArray<string>;
}

/** The walk's and the workshop's own services. The container provides files and processes. */
const PressLive = Layer.mergeAll(Stacks.layer, ReadingCopies.layer).pipe(
	Layer.provide(Digest.layerWebCrypto)
);

/**
 * The press: the one service that touches book files. It walks the library and reports each work,
 * edition and pair to the model, which decides what that changes. When the model asks, it makes a
 * pair's reading copy, one at a time, and reports how that went.
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
				{ hostPath: LIBRARY_ON_HOST, containerPath: LIBRARY, readOnly: true },
				{ hostPath: COPIES_ON_HOST, containerPath: COPIES },
			],
		};
	}).pipe(Effect.provide(Database)),
	Effect.gen(function* () {
		const host = yield* ServerHost;
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const stacks = yield* Stacks;
		const copies = yield* ReadingCopies;
		const last = yield* Ref.make(Option.none<Report>());
		const waiting = yield* Queue.unbounded<AlignRequest>();
		const asked = yield* Ref.make(HashSet.empty<string>());

		// Each request waits on disk as well, one file per work, until the press has answered it, so a
		// restart (a deploy, a crash) picks up where it left off instead of waiting out the deadline.
		const pending = path.join(COPIES, ".pending");

		const pendingFile = (request: AlignRequest) =>
			path.join(pending, `${request.work}.json`);

		/** The model's door for the press. */
		const model = PressApi.clientHttp(`http://${API_ALIAS}:3000/press`);

		/** Tell the model about one book. Sending the same book again changes nothing. */
		const report = Effect.fn("Press.report")(function* (book: Book) {
			const press = yield* model;
			const id = WorkId.make(yield* stacks.workIdOf(book.shelfmark));
			const shelfmark = Shelfmark.make(book.shelfmark);

			yield* press.CatalogueWork(id, {
				title: book.title,
				author: book.author,
				shelfmark,
			});

			for (const kind of ["text", "audio"] as const) {
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
			const { books, unreadable } = yield* stacks.survey(LIBRARY);

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

			yield* fs.remove(pendingFile(request), { force: true });
		}, Effect.scoped);

		/** Queue a pair, once: the Alignment policy may ask twice for the same try. */
		const enqueue = Effect.fn("Press.enqueue")(function* (
			request: AlignRequest
		) {
			const key = `${request.work}:${request.attempt}`;

			const isNew = yield* Ref.modify(asked, (seen) =>
				HashSet.has(seen, key) ? [false, seen] : [true, HashSet.add(seen, key)]
			);

			if (isNew) {
				yield* fs.makeDirectory(pending, { recursive: true });
				yield* fs.writeFileString(
					pendingFile(request),
					yield* encodeRequest(request)
				);
				yield* Queue.offer(waiting, request);
			}
		});

		/** Put back what was waiting when the press last stopped. A file that won't decode is skipped. */
		const resume = Effect.gen(function* () {
			yield* fs.makeDirectory(pending, { recursive: true });

			for (const name of yield* fs.readDirectory(pending)) {
				yield* fs
					.readFileString(path.join(pending, name))
					.pipe(
						Effect.flatMap(decodeRequest),
						Effect.flatMap(enqueue),
						Effect.catchCause(Effect.logWarning)
					);
			}
		});

		yield* host.run(
			walk().pipe(Effect.repeat(Schedule.spaced("5 minutes")), Effect.asVoid)
		);

		// Like the walk, the worker runs only in the container: Alchemy also runs this setup on your
		// machine when it plans a deploy, where /copies doesn't exist. Without its folder the press can
		// do nothing, so it stops there and says why. Then one reading copy at a time, since the aligner
		// uses every core it is given. A failure to report is logged, and the deadline covers the try.
		yield* host.run(
			resume.pipe(
				Effect.orDie,
				Effect.andThen(
					Queue.take(waiting).pipe(
						Effect.flatMap((request) =>
							align(request).pipe(Effect.catchCause(Effect.logError))
						),
						Effect.forever
					)
				)
			)
		);

		return {
			fetch: Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest;
				const route = new URL(request.url, "http://localhost").pathname;

				if (request.method === "POST" && route === "/align") {
					yield* enqueue(yield* HttpServerRequest.schemaBodyJson(AlignRequest));

					return HttpServerResponse.empty({ status: 202 });
				}

				return yield* HttpServerResponse.json(
					Option.getOrNull(yield* Ref.get(last))
				);
			}).pipe(Effect.orDie),
		};
	}).pipe(Effect.provide(PressLive))
) {}

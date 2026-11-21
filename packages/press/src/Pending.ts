import { ShelveRequest } from "@prosody/domain/Library/Stacks.external";
import { AlignRequest } from "@prosody/domain/Narration/Aligner.external";
import { CopyRequest } from "@prosody/domain/Reading/Copier.external";
import {
	Context,
	Effect,
	FileSystem,
	HashSet,
	Layer,
	Path,
	Queue,
	Ref,
	Schema,
} from "effect";
import type { PlatformError } from "effect";

import { COPIES } from "./ReadingCopies.ts";

/** What the model asks of the press: to align a pair, to copy an edition alone, or to shelve a payload. */
const PressRequest = Schema.Union([AlignRequest, CopyRequest, ShelveRequest]);

type PressRequest = typeof PressRequest.Type;

export const isCopy = Schema.is(CopyRequest);

const isShelve = Schema.is(ShelveRequest);

/** A request's file in the queue on disk. */
const nameOf = (request: PressRequest) => {
	if (isShelve(request)) {
		return `${request.grab}.shelve.json`;
	}

	return isCopy(request)
		? `${request.work}.${request.attempt}.copy.json`
		: `${request.work}.json`;
};

/** A request as the press keeps it on disk until it has answered. */
const decodeRequest = Schema.decodeUnknownEffect(
	Schema.fromJsonString(PressRequest)
);

const encodeRequest = Schema.encodeEffect(Schema.fromJsonString(PressRequest));

/**
 * The press's queue: what the model asked, in two lines, pairs and copies in one and payloads in
 * the other. Each request waits in `/copies/.pending` as well, until the press has answered it, so a
 * restart (a deploy, a crash) picks up where it left off instead of waiting out a deadline. A pair
 * waits as `<work>.json`; a copy as `<work>.<attempt>.copy.json`, since a remake can overtake a try
 * still waiting, and each try's file is removed only when that try is answered; a payload as
 * `<grab>.shelve.json`.
 */
export class Pending extends Context.Service<
	Pending,
	{
		readonly waiting: Queue.Queue<AlignRequest | CopyRequest>;
		readonly shelving: Queue.Queue<ShelveRequest>;
		/** Queue a request, once: a policy may ask twice for the same try. */
		readonly enqueue: (
			request: PressRequest
		) => Effect.Effect<void, PlatformError.PlatformError | Schema.SchemaError>;
		/**
		 * Put back what was waiting when the press last stopped. A file that won't decode is skipped.
		 * In name order, so a work's copy (`<work>.<attempt>.copy.json`) runs before its pair
		 * (`<work>.json`), which was asked for later and replaces it.
		 */
		readonly resume: Effect.Effect<void, PlatformError.PlatformError>;
		/** Take an answered request off the disk. */
		readonly done: (
			request: PressRequest
		) => Effect.Effect<void, PlatformError.PlatformError>;
	}
>()("@prosody/press/Pending", {
	make: Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const folder = path.join(COPIES, ".pending");
		const waiting = yield* Queue.unbounded<AlignRequest | CopyRequest>();
		const shelving = yield* Queue.unbounded<ShelveRequest>();
		const asked = yield* Ref.make(HashSet.empty<string>());

		const enqueue = Effect.fn("Pending.enqueue")(function* (
			request: PressRequest
		) {
			const isNew = yield* Ref.modify(asked, (seen) => {
				const key = nameOf(request);

				return HashSet.has(seen, key)
					? [false, seen]
					: [true, HashSet.add(seen, key)];
			});

			if (isNew) {
				yield* fs.makeDirectory(folder, { recursive: true });
				yield* fs.writeFileString(
					path.join(folder, nameOf(request)),
					yield* encodeRequest(request)
				);
				yield* isShelve(request)
					? Queue.offer(shelving, request)
					: Queue.offer(waiting, request);
			}
		});

		const resume = Effect.gen(function* () {
			yield* fs.makeDirectory(folder, { recursive: true });

			for (const name of (yield* fs.readDirectory(folder)).toSorted()) {
				yield* fs
					.readFileString(path.join(folder, name))
					.pipe(
						Effect.flatMap(decodeRequest),
						Effect.flatMap(enqueue),
						Effect.catchCause(Effect.logWarning)
					);
			}
		}).pipe(Effect.withSpan("Pending.resume"));

		const done = (request: PressRequest) =>
			fs.remove(path.join(folder, nameOf(request)), { force: true });

		return { waiting, shelving, enqueue, resume, done };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}

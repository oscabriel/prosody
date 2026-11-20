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
const Job = Schema.Union([AlignRequest, CopyRequest, ShelveRequest]);

type Job = typeof Job.Type;

export const isCopy = Schema.is(CopyRequest);

const isShelve = Schema.is(ShelveRequest);

/** A job's file in the queue on disk. */
const nameOf = (job: Job) => {
	if (isShelve(job)) {
		return `${job.grab}.shelve.json`;
	}

	return isCopy(job)
		? `${job.work}.${job.attempt}.copy.json`
		: `${job.work}.json`;
};

/** A job as the press keeps it on disk until it has answered. */
const decodeJob = Schema.decodeUnknownEffect(Schema.fromJsonString(Job));

const encodeJob = Schema.encodeEffect(Schema.fromJsonString(Job));

/**
 * The press's queue: what the model asked, in two lines, pairs and copies in one and payloads in
 * the other. Each job waits in `/copies/.pending` as well, until the press has answered it, so a
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
		/** Queue a job, once: a policy may ask twice for the same try. */
		readonly enqueue: (
			job: Job
		) => Effect.Effect<void, PlatformError.PlatformError | Schema.SchemaError>;
		/**
		 * Put back what was waiting when the press last stopped. A file that won't decode is skipped.
		 * In name order, so a work's copy (`<work>.<attempt>.copy.json`) runs before its pair
		 * (`<work>.json`), which was asked for later and replaces it.
		 */
		readonly resume: Effect.Effect<void, PlatformError.PlatformError>;
		/** Take an answered job off the disk. */
		readonly done: (
			job: Job
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

		const enqueue = Effect.fn("Pending.enqueue")(function* (job: Job) {
			const isNew = yield* Ref.modify(asked, (seen) => {
				const key = nameOf(job);

				return HashSet.has(seen, key)
					? [false, seen]
					: [true, HashSet.add(seen, key)];
			});

			if (isNew) {
				yield* fs.makeDirectory(folder, { recursive: true });
				yield* fs.writeFileString(
					path.join(folder, nameOf(job)),
					yield* encodeJob(job)
				);
				yield* isShelve(job)
					? Queue.offer(shelving, job)
					: Queue.offer(waiting, job);
			}
		});

		const resume = Effect.gen(function* () {
			yield* fs.makeDirectory(folder, { recursive: true });

			for (const name of (yield* fs.readDirectory(folder)).toSorted()) {
				yield* fs
					.readFileString(path.join(folder, name))
					.pipe(
						Effect.flatMap(decodeJob),
						Effect.flatMap(enqueue),
						Effect.catchCause(Effect.logWarning)
					);
			}
		}).pipe(Effect.withSpan("Pending.resume"));

		const done = (job: Job) =>
			fs.remove(path.join(folder, nameOf(job)), { force: true });

		return { waiting, shelving, enqueue, resume, done };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}

import * as Domain from "@alchemy.run/domain";
import { Effect, Schema } from "effect";

import { Device } from "../Device.context.ts";
import { WorkId } from "../Library/Work.id.ts";
import { BookFinished, FinishBook } from "./FinishBook.command.ts";
import { KeepPlace, PlaceKept, StalePlace } from "./KeepPlace.command.ts";
import { BookOpened, OpenBook } from "./OpenBook.command.ts";
import { Bookmark } from "./Sentence.ts";
import { BookSetAside, NotReading, SetAside } from "./SetAside.command.ts";
import { Stage } from "./Stage.ts";

const State = Schema.Struct({
	place: Schema.NullOr(Bookmark),
	// A state kept before the nightstand existed: the work goes on it when it is next opened.
	stage: Stage.pipe(
		Schema.withDecodingDefaultKey(Effect.succeed<Stage>("unopened"))
	),
}).annotate({ identifier: "ReadingState" });

/**
 * Your reading of one work: one place, whichever device kept it, and whether the work is on your
 * nightstand. A place kept later wins, so a phone that was offline can't drag you back to where it
 * last was.
 */
export class Reading extends Domain.Aggregate("Reading", {
	id: WorkId,
	state: State,
	initial: { place: null, stage: "unopened" },
	commands: [KeepPlace, OpenBook, FinishBook, SetAside],
	decide: {
		KeepPlace: Effect.fn(function* (reading, cmd) {
			const { place } = reading;

			if (place !== null && place.at > cmd.at) {
				return yield* new StalePlace({ keptAt: place.at });
			}

			if (
				place !== null &&
				place.at === cmd.at &&
				place.sentence === cmd.sentence &&
				place.time === cmd.time &&
				place.page === cmd.page
			) {
				return [];
			}

			return [
				new PlaceKept({
					sentence: cmd.sentence,
					time: cmd.time,
					page: cmd.page,
					at: cmd.at,
					device: yield* Device,
				}),
			];
		}),
		OpenBook: Effect.fn(function* (reading, cmd) {
			return reading.stage === "reading"
				? []
				: [new BookOpened({ at: cmd.at, device: yield* Device })];
		}),
		FinishBook: Effect.fn(function* (reading, cmd) {
			return reading.stage === "finished"
				? []
				: [new BookFinished({ at: cmd.at, device: yield* Device })];
		}),
		SetAside: Effect.fn(function* (reading, cmd) {
			if (reading.stage === "setAside") {
				return [];
			}

			if (reading.stage !== "reading") {
				return yield* new NotReading({ stage: reading.stage });
			}

			return [new BookSetAside({ at: cmd.at, device: yield* Device })];
		}),
	},
	evolve: {
		PlaceKept: (reading, e) => ({
			...reading,
			place: {
				sentence: e.sentence,
				time: e.time,
				page: e.page,
				at: e.at,
				device: e.device,
			},
		}),
		BookOpened: (reading) => ({ ...reading, stage: "reading" as const }),
		BookFinished: (reading) => ({ ...reading, stage: "finished" as const }),
		BookSetAside: (reading) => ({ ...reading, stage: "setAside" as const }),
	},
}) {}

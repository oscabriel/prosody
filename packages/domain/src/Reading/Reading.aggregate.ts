import * as Domain from "@alchemy.run/domain";
import { Effect, Schema } from "effect";

import { asReader } from "../Session.middleware.ts";
import { BookFinished, FinishBook } from "./FinishBook.command.ts";
import { KeepPlace, PlaceKept, StalePlace } from "./KeepPlace.command.ts";
import { BookOpened, OpenBook } from "./OpenBook.command.ts";
import { readerOf, ReadingId } from "./Reading.id.ts";
import { KeptPlace } from "./Sentence.ts";
import { BookSetAside, NotReading, SetAside } from "./SetAside.command.ts";
import { Stage } from "./Stage.ts";

const State = Schema.Struct({
	place: Schema.NullOr(KeptPlace),
	stage: Stage.pipe(
		Schema.withDecodingDefaultKey(Effect.succeed<Stage>("unopened"))
	),
}).annotate({ identifier: "ReadingState" });

export class Reading extends Domain.Aggregate("Reading", {
	id: ReadingId,
	state: State,
	initial: { place: null, stage: "unopened" },
	commands: [KeepPlace, OpenBook, FinishBook, SetAside],
	decide: {
		KeepPlace: Effect.fn(function* (reading, cmd, { id }) {
			const { device } = yield* asReader(readerOf(id));
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
					device,
				}),
			];
		}),
		OpenBook: Effect.fn(function* (reading, cmd, { id }) {
			const { device } = yield* asReader(readerOf(id));

			return reading.stage === "reading"
				? []
				: [new BookOpened({ at: cmd.at, device })];
		}),
		FinishBook: Effect.fn(function* (reading, cmd, { id }) {
			const { device } = yield* asReader(readerOf(id));

			return reading.stage === "finished"
				? []
				: [new BookFinished({ at: cmd.at, device })];
		}),
		SetAside: Effect.fn(function* (reading, cmd, { id }) {
			const { device } = yield* asReader(readerOf(id));

			if (reading.stage === "setAside") {
				return [];
			}

			if (reading.stage !== "reading") {
				return yield* new NotReading({ stage: reading.stage });
			}

			return [new BookSetAside({ at: cmd.at, device })];
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

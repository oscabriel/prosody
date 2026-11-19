import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { KeepPlace, PlaceKept, StalePlace } from "./KeepPlace.command.ts";
import { Bookmark } from "./Sentence.ts";

const State = Schema.Struct({
	place: Schema.NullOr(Bookmark),
}).annotate({ identifier: "ReadingState" });

/**
 * Your reading of one work: one place, whichever device kept it. A place kept later wins, so a
 * phone that was offline can't drag you back to where it last was.
 */
export class Reading extends Domain.Aggregate("Reading", {
	id: WorkId,
	state: State,
	initial: { place: null },
	commands: [KeepPlace],
	decide: {
		KeepPlace: (reading, cmd) => {
			const { place } = reading;

			if (place !== null && place.at > cmd.at) {
				return new StalePlace({ keptAt: place.at });
			}

			if (
				place !== null &&
				place.at === cmd.at &&
				place.sentence === cmd.sentence
			) {
				return [];
			}

			return [
				new PlaceKept({
					sentence: cmd.sentence,
					at: cmd.at,
					device: cmd.device,
				}),
			];
		},
	},
	evolve: {
		PlaceKept: (_reading, e) => ({
			place: { sentence: e.sentence, at: e.at, device: e.device },
		}),
	},
}) {}

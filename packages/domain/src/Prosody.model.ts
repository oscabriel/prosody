import * as Domain from "@alchemy.run/domain";
import { Layer } from "effect";

import { Shelf, ShelfLive } from "./Library/Shelf.view.ts";
import { Work } from "./Library/Work.aggregate.ts";
import { Alignment, AlignmentLive } from "./Narration/Alignment.policy.ts";
import { Narration } from "./Narration/Narration.aggregate.ts";
import { Nightstand, NightstandLive } from "./Reading/Nightstand.view.ts";
import { Place, PlaceLive } from "./Reading/Place.view.ts";
import { Reading } from "./Reading/Reading.aggregate.ts";

/**
 * Everything Prosody knows and decides: the library, each pair's narration, and your reading of each
 * work.
 */
export class Prosody extends Domain.Model("Prosody", {
	aggregates: [Work, Narration, Reading],
	views: [Shelf, Place, Nightstand],
	policies: [Alignment],
}) {}

/** Implementations of policies, queries and view guards. Alignment needs an Aligner. */
export const ProsodyHandlers = Layer.mergeAll(
	AlignmentLive,
	ShelfLive,
	PlaceLive,
	NightstandLive
);

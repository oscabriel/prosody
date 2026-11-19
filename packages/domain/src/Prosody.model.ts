import * as Domain from "@alchemy.run/domain";
import { Layer } from "effect";

import { Shelf } from "./Library/Shelf.view.ts";
import { Work } from "./Library/Work.aggregate.ts";
import { Alignment, AlignmentLive } from "./Narration/Alignment.policy.ts";
import { Narration } from "./Narration/Narration.aggregate.ts";
import { Place } from "./Reading/Place.view.ts";
import { Reading } from "./Reading/Reading.aggregate.ts";

/** Everything Prosody knows and decides: the library, each pair's narration, and your place in each work. */
export class Prosody extends Domain.Model("Prosody", {
	aggregates: [Work, Narration, Reading],
	views: [Shelf, Place],
	policies: [Alignment],
}) {}

/** Implementations of policies, queries and view guards. Alignment needs an Aligner. */
export const ProsodyHandlers = Layer.mergeAll(AlignmentLive);

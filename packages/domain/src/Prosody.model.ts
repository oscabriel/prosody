import * as Domain from "@alchemy.run/domain";
import { Layer } from "effect";

import { Shelf, ShelfLive } from "./Library/Shelf.view.ts";
import { Work } from "./Library/Work.aggregate.ts";
import { Alignment, AlignmentLive } from "./Narration/Alignment.policy.ts";
import { Narration } from "./Narration/Narration.aggregate.ts";
import { Copy } from "./Reading/Copy.aggregate.ts";
import { Nightstand, NightstandLive } from "./Reading/Nightstand.view.ts";
import { Place, PlaceLive } from "./Reading/Place.view.ts";
import { Reading } from "./Reading/Reading.aggregate.ts";
import { ReadingCopy, ReadingCopyLive } from "./Reading/ReadingCopy.policy.ts";

/**
 * Everything Prosody knows and decides: the library, each pair's narration, the copy of each work
 * with one edition, and your reading of each work.
 */
export class Prosody extends Domain.Model("Prosody", {
	aggregates: [Work, Narration, Copy, Reading],
	views: [Shelf, Place, Nightstand],
	policies: [Alignment, ReadingCopy],
}) {}

/**
 * Implementations of policies, queries and view guards. Alignment needs an Aligner, and ReadingCopy
 * a Copier.
 */
export const ProsodyHandlers = Layer.mergeAll(
	AlignmentLive,
	ReadingCopyLive,
	ShelfLive,
	PlaceLive,
	NightstandLive
);

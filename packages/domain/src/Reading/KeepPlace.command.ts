import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { Bookmark } from "./Sentence.ts";

/** A reader's place in a work moved. */
export class PlaceKept extends Domain.Event("PlaceKept", Bookmark.fields) {}

/** Another device kept a newer place. `keptAt` is the evidence: when it did. */
export class StalePlace extends Domain.Rejection(
	"StalePlace",
	{ keptAt: Schema.Int },
	{ httpApiStatus: 409 }
) {}

/**
 * Keep the reader's place in a work. A device sends it as you read or listen, and again until it
 * hears back, so sending the same place twice records it once.
 */
export class KeepPlace extends Domain.Command("KeepPlace", {
	target: WorkId,
	input: Bookmark.fields,
	events: [PlaceKept],
	rejects: [StalePlace],
}) {}

import * as Domain from "@alchemy.run/domain";

import { Shelfmark } from "./Shelfmark.ts";
import { WorkId } from "./Work.id.ts";

/** The folder is this work's. */
export class ShelfmarkClaimed extends Domain.Event("ShelfmarkClaimed", {
	work: WorkId,
}) {}

/** Another work holds the folder. `work` is the one that does. */
export class ShelfmarkTaken extends Domain.Rejection(
	"ShelfmarkTaken",
	{ work: WorkId },
	{ httpApiStatus: 409 }
) {}

/**
 * Claim a folder in the library for a work. The first claim wins and every later one is told whose
 * it is; the same work claiming it again changes nothing.
 */
export class ClaimShelfmark extends Domain.Command("ClaimShelfmark", {
	target: Shelfmark,
	input: { work: WorkId },
	events: [ShelfmarkClaimed],
	rejects: [ShelfmarkTaken],
}) {}

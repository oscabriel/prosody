import * as Domain from "@alchemy.run/domain";

import { Shelfmark } from "./Shelfmark.ts";
import { WorkId } from "./Work.id.ts";

export class ShelfmarkClaimed extends Domain.Event("ShelfmarkClaimed", {
	work: WorkId,
}) {}

export class ShelfmarkTaken extends Domain.Rejection(
	"ShelfmarkTaken",
	{ work: WorkId },
	{ httpApiStatus: 409 }
) {}

export class ClaimShelfmark extends Domain.Command("ClaimShelfmark", {
	target: Shelfmark,
	input: { work: WorkId },
	events: [ShelfmarkClaimed],
	rejects: [ShelfmarkTaken],
}) {}

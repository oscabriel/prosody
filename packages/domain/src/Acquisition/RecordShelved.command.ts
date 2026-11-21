import * as Domain from "@alchemy.run/domain";

import { Shelfmark } from "../Library/Shelfmark.ts";
import { WorkId } from "../Library/Work.id.ts";
import { GrabId } from "./Grab.id.ts";

export class PayloadShelved extends Domain.Event("PayloadShelved", {
	work: WorkId,
	shelfmark: Shelfmark,
}) {}

export class RecordShelved extends Domain.Command("RecordShelved", {
	target: GrabId,
	input: { work: WorkId, shelfmark: Shelfmark },
	events: [PayloadShelved],
}) {}

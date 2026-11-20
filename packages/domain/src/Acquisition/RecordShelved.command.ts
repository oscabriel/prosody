import * as Domain from "@alchemy.run/domain";

import { Shelfmark } from "../Library/Shelfmark.ts";
import { WorkId } from "../Library/Work.id.ts";
import { GrabId } from "./Grab.id.ts";

/** The payload's edition is on the shelf, in this work's folder. */
export class PayloadShelved extends Domain.Event("PayloadShelved", {
	work: WorkId,
	shelfmark: Shelfmark,
}) {}

/** The press reports it copied the payload's edition into the library. Recorded once. */
export class RecordShelved extends Domain.Command("RecordShelved", {
	target: GrabId,
	input: { work: WorkId, shelfmark: Shelfmark },
	events: [PayloadShelved],
}) {}

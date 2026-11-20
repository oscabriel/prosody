import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { GrabId } from "./Grab.id.ts";

/** The download stopped coming, for this reason. `ResumeGrab` or `AbandonGrab` leaves it. */
export class GrabStalled extends Domain.Event("GrabStalled", {
	reason: Schema.String,
}) {}

/**
 * A download has stalled: nothing has come for a while, qBittorrent stopped it, or it could not be
 * started. Recorded only for a grab that is downloading.
 */
export class RecordStall extends Domain.Command("RecordStall", {
	target: GrabId,
	input: { reason: Schema.String },
	events: [GrabStalled],
}) {}

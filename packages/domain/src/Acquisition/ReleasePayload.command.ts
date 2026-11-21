import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Session } from "../Session.middleware.ts";
import { NotDownloading } from "./AbandonGrab.command.ts";
import { GrabId } from "./Grab.id.ts";

/**
 * What your tracker asks of every payload: here, seeded 72 hours within 30 days of its download.
 * Change it to your own tracker's rule; `hours: 0` lets every payload go as soon as it has come.
 */
export const OBLIGATION = { hours: 72, days: 30 };

export class PayloadReleased extends Domain.Event("PayloadReleased", {}) {}

/** The payload has not been seeded long enough. `hours` is how many more it owes. */
export class StillObligated extends Domain.Rejection(
	"StillObligated",
	{ hours: Schema.Int },
	{ httpApiStatus: 409 }
) {}

/**
 * Stop seeding a payload that owes nothing more: it leaves qBittorrent's list, and its files stay
 * where they are. Refused until it has seeded its hours, and for a grab abandoned or never started.
 */
export class ReleasePayload extends Domain.Command("ReleasePayload", {
	target: GrabId,
	middleware: [Session],
	events: [PayloadReleased],
	rejects: [StillObligated, NotDownloading],
}) {}

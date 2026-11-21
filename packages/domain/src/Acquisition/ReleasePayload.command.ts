import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Session } from "../Session.middleware.ts";
import { NotDownloading } from "./AbandonGrab.command.ts";
import { GrabId } from "./Grab.id.ts";

export const OBLIGATION = { hours: 72, days: 30 };

export class PayloadReleased extends Domain.Event("PayloadReleased", {}) {}

export class StillObligated extends Domain.Rejection(
	"StillObligated",
	{ hours: Schema.Int },
	{ httpApiStatus: 409 }
) {}

export class ReleasePayload extends Domain.Command("ReleasePayload", {
	target: GrabId,
	middleware: [Session],
	events: [PayloadReleased],
	rejects: [StillObligated, NotDownloading],
}) {}

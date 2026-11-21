import * as Domain from "@alchemy.run/domain";

import { Session } from "../Session.middleware.ts";
import { GrabId, GrabStatus } from "./Grab.id.ts";

export class GrabAbandoned extends Domain.Event("GrabAbandoned", {}) {}

export class NotDownloading extends Domain.Rejection(
	"NotDownloading",
	{ status: GrabStatus },
	{ httpApiStatus: 409 }
) {}

export class AbandonGrab extends Domain.Command("AbandonGrab", {
	target: GrabId,
	middleware: [Session],
	events: [GrabAbandoned],
	rejects: [NotDownloading],
}) {}

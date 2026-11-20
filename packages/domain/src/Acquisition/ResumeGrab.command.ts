import * as Domain from "@alchemy.run/domain";

import { Session } from "../Session.middleware.ts";
import { NotDownloading } from "./AbandonGrab.command.ts";
import { GrabId } from "./Grab.id.ts";

export class GrabResumed extends Domain.Event("GrabResumed", {}) {}

/**
 * Ask again for a grab still downloading: once the tracker is fixed, say. The download is started
 * and asks for peers again, or is added again if qBittorrent does not have it.
 */
export class ResumeGrab extends Domain.Command("ResumeGrab", {
	target: GrabId,
	middleware: [Session],
	events: [GrabResumed],
	rejects: [NotDownloading],
}) {}

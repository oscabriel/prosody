import * as Domain from "@alchemy.run/domain";

import { Session } from "../Session.middleware.ts";
import { NotDownloading } from "./AbandonGrab.command.ts";
import { GrabId } from "./Grab.id.ts";

export class GrabResumed extends Domain.Event("GrabResumed", {}) {}

export class ResumeGrab extends Domain.Command("ResumeGrab", {
	target: GrabId,
	middleware: [Session],
	events: [GrabResumed],
	rejects: [NotDownloading],
}) {}

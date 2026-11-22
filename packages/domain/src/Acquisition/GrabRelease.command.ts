import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { Forbidden, Session } from "../Session.middleware.ts";
import { GrabId } from "./Grab.id.ts";
import { Release } from "./Release.ts";
import { NotWanted } from "./WithdrawWant.command.ts";

export class ReleaseGrabbed extends Domain.Event("ReleaseGrabbed", {
	grab: GrabId,
	release: Release,
}) {}

export class ReleaseNotOffered extends Domain.Rejection(
	"ReleaseNotOffered",
	{},
	{ httpApiStatus: 404 }
) {}

export class GrabRelease extends Domain.Command("GrabRelease", {
	target: WorkId,
	input: { release: Schema.String },
	middleware: [Session],
	events: [ReleaseGrabbed],
	rejects: [NotWanted, ReleaseNotOffered, Forbidden],
}) {}

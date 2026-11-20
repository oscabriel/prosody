import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { Session } from "../Session.middleware.ts";
import { GrabId } from "./Grab.id.ts";
import { Release } from "./Release.ts";
import { NotWanted } from "./WithdrawWant.command.ts";

/** You chose a release of the book. Its grab downloads it. */
export class ReleaseGrabbed extends Domain.Event("ReleaseGrabbed", {
	grab: GrabId,
	release: Release,
}) {}

/** The latest search did not offer that release. Search again: offers go stale. */
export class ReleaseNotOffered extends Domain.Rejection(
	"ReleaseNotOffered",
	{},
	{ httpApiStatus: 404 }
) {}

/**
 * Grab one of the releases the latest search offered, by its id. Only you send it: no policy ever
 * grabs. Grabbing a release already grabbed changes nothing.
 */
export class GrabRelease extends Domain.Command("GrabRelease", {
	target: WorkId,
	input: { release: Schema.String },
	middleware: [Session],
	events: [ReleaseGrabbed],
	rejects: [NotWanted, ReleaseNotOffered],
}) {}

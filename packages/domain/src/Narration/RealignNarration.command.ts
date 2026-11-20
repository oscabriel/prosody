import * as Domain from "@alchemy.run/domain";

import { WorkId } from "../Library/Work.id.ts";
import { Session } from "../Session.middleware.ts";
import { AlignmentStarted } from "./PairEditions.command.ts";

/** The work has no pair, so there is nothing to align. */
export class NotPaired extends Domain.Rejection(
	"NotPaired",
	{},
	{ httpApiStatus: 404 }
) {}

/** A try is already running. Wait for it to finish or run out of time. */
export class AlreadyAligning extends Domain.Rejection(
	"AlreadyAligning",
	{},
	{ httpApiStatus: 409 }
) {}

/** Try again: after a failure, or to align a book that is already aligned once more. */
export class RealignNarration extends Domain.Command("RealignNarration", {
	target: WorkId,
	middleware: [Session],
	events: [AlignmentStarted],
	rejects: [NotPaired, AlreadyAligning],
}) {}

import * as Domain from "@alchemy.run/domain";

import { WorkId } from "../Library/Work.id.ts";
import { Session } from "../Session.middleware.ts";
import { CopyStarted } from "./CopyEdition.command.ts";

/** The work has no edition alone, so there is nothing to copy. */
export class NothingToCopy extends Domain.Rejection(
	"NothingToCopy",
	{},
	{ httpApiStatus: 404 }
) {}

/**
 * Try again: after a failure, or when a try was lost. A try still running is overtaken, and its
 * answer ignored.
 */
export class RemakeCopy extends Domain.Command("RemakeCopy", {
	target: WorkId,
	middleware: [Session],
	events: [CopyStarted],
	rejects: [NothingToCopy],
}) {}

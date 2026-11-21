import * as Domain from "@alchemy.run/domain";

import { WorkId } from "../Library/Work.id.ts";
import { Session } from "../Session.middleware.ts";
import { CopyStarted } from "./CopyEdition.command.ts";

export class NothingToCopy extends Domain.Rejection(
	"NothingToCopy",
	{},
	{ httpApiStatus: 404 }
) {}

export class RemakeCopy extends Domain.Command("RemakeCopy", {
	target: WorkId,
	middleware: [Session],
	events: [CopyStarted],
	rejects: [NothingToCopy],
}) {}

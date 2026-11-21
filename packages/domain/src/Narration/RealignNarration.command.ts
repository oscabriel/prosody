import * as Domain from "@alchemy.run/domain";

import { WorkId } from "../Library/Work.id.ts";
import { Session } from "../Session.middleware.ts";
import { AlignmentStarted } from "./PairEditions.command.ts";

export class NotPaired extends Domain.Rejection(
	"NotPaired",
	{},
	{ httpApiStatus: 404 }
) {}

export class AlreadyAligning extends Domain.Rejection(
	"AlreadyAligning",
	{},
	{ httpApiStatus: 409 }
) {}

export class RealignNarration extends Domain.Command("RealignNarration", {
	target: WorkId,
	middleware: [Session],
	events: [AlignmentStarted],
	rejects: [NotPaired, AlreadyAligning],
}) {}

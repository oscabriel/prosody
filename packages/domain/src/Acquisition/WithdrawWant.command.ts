import * as Domain from "@alchemy.run/domain";

import { WorkId } from "../Library/Work.id.ts";
import { Session } from "../Session.middleware.ts";

export class WantWithdrawn extends Domain.Event("WantWithdrawn", {}) {}

export class NotWanted extends Domain.Rejection(
	"NotWanted",
	{},
	{ httpApiStatus: 409 }
) {}

export class WithdrawWant extends Domain.Command("WithdrawWant", {
	target: WorkId,
	middleware: [Session],
	events: [WantWithdrawn],
	rejects: [NotWanted],
}) {}

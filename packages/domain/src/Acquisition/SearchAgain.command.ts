import * as Domain from "@alchemy.run/domain";

import { WorkId } from "../Library/Work.id.ts";
import { Session } from "../Session.middleware.ts";
import { SearchStarted } from "./WantBook.command.ts";
import { NotWanted } from "./WithdrawWant.command.ts";

export class SearchAgain extends Domain.Command("SearchAgain", {
	target: WorkId,
	middleware: [Session],
	events: [SearchStarted],
	rejects: [NotWanted],
}) {}

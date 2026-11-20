import * as Domain from "@alchemy.run/domain";

import { WorkId } from "../Library/Work.id.ts";
import { Session } from "../Session.middleware.ts";
import { SearchStarted } from "./WantBook.command.ts";
import { NotWanted } from "./WithdrawWant.command.ts";

/**
 * Search for a wanted book again: after a failed search, or for releases uploaded since. A search
 * still running is overtaken, and its answer ignored.
 */
export class SearchAgain extends Domain.Command("SearchAgain", {
	target: WorkId,
	middleware: [Session],
	events: [SearchStarted],
	rejects: [NotWanted],
}) {}

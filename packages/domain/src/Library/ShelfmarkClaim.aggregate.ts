import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import {
	ClaimShelfmark,
	ShelfmarkClaimed,
	ShelfmarkTaken,
} from "./ClaimShelfmark.command.ts";
import { Shelfmark } from "./Shelfmark.ts";
import { WorkId } from "./Work.id.ts";

/**
 * One folder in the library, keyed by its shelfmark, and the work that holds it. Two works reaching
 * for one folder meet here, and exactly one has it: a second import of a book is told the first's
 * work, and no `Title (2)` is made beside it.
 */
export class ShelfmarkClaim extends Domain.Aggregate("ShelfmarkClaim", {
	id: Shelfmark,
	state: Schema.Struct({ work: Schema.NullOr(WorkId) }),
	initial: { work: null },
	commands: [ClaimShelfmark],
	decide: {
		ClaimShelfmark: (claim, cmd) => {
			if (claim.work === null) {
				return [new ShelfmarkClaimed({ work: cmd.work })];
			}

			return claim.work === cmd.work
				? []
				: new ShelfmarkTaken({ work: claim.work });
		},
	},
	evolve: {
		ShelfmarkClaimed: (_claim, e) => ({ work: e.work }),
	},
}) {}

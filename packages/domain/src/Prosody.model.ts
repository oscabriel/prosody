import * as Domain from "@alchemy.run/domain";
import { Layer } from "effect";

import { Shelf } from "./Library/Shelf.view.ts";
import { Work } from "./Library/Work.aggregate.ts";

/** Everything Prosody knows and decides. Step 1 begins with the library. */
export class Prosody extends Domain.Model("Prosody", {
	aggregates: [Work],
	views: [Shelf],
}) {}

/** Implementations of policies, queries and view guards. None exist yet. */
export const ProsodyHandlers = Layer.empty;

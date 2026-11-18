import * as Domain from "@alchemy.run/domain";
import { Layer } from "effect";

import { Shelf } from "./Library/Shelf.view.ts";
import { Work } from "./Library/Work.aggregate.ts";
import { Narration } from "./Narration/Narration.aggregate.ts";

/** Everything Prosody knows and decides: the library, and each pair's narration. */
export class Prosody extends Domain.Model("Prosody", {
	aggregates: [Work, Narration],
	views: [Shelf],
}) {}

/** Implementations of policies, queries and view guards. None exist yet. */
export const ProsodyHandlers = Layer.empty;

import * as Domain from "@alchemy.run/domain";

import { Prosody } from "./Prosody.model.ts";

/** What a reader's app may reach. For now, the shelf. */

export class ReaderApi extends Domain.Api("ReaderApi", {
	model: Prosody,
	commands: [],
	views: ["Shelf"],
}) {}

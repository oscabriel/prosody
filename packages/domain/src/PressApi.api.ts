import * as Domain from "@alchemy.run/domain";

import { Prosody } from "./Prosody.model.ts";

/** What the press may report: the works and editions it finds, their pairs, and how aligning went. */
export class PressApi extends Domain.Api("PressApi", {
	model: Prosody,
	commands: [
		"CatalogueWork",
		"ShelveEdition",
		"PairEditions",
		"RecordAlignment",
		"RecordAlignmentFailed",
	],
	views: [],
}) {}

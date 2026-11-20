import * as Domain from "@alchemy.run/domain";

import { Prosody } from "./Prosody.model.ts";

/**
 * What the press may report: the works and editions it finds, their pairs and editions alone, and how
 * aligning and copying went.
 */
export class PressApi extends Domain.Api("PressApi", {
	model: Prosody,
	commands: [
		"CatalogueWork",
		"ShelveEdition",
		"PairEditions",
		"RecordAlignment",
		"RecordAlignmentFailed",
		"CopyEdition",
		"RecordCopy",
		"RecordCopyFailed",
	],
	views: [],
}) {}

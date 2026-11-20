import * as Domain from "@alchemy.run/domain";

import { Prosody } from "./Prosody.model.ts";

/**
 * What the press may report: the works and editions it finds, the folders they are in, their pairs
 * and editions alone, how aligning and copying went, and how each grab's download and shelving go.
 */
export class PressApi extends Domain.Api("PressApi", {
	model: Prosody,
	commands: [
		"ClaimShelfmark",
		"CatalogueWork",
		"ShelveEdition",
		"PairEditions",
		"RecordAlignment",
		"RecordAlignmentFailed",
		"CopyEdition",
		"RecordCopy",
		"RecordCopyFailed",
		"RecordProgress",
		"RecordStall",
		"RecordPayloadArrived",
		"RecordSeeding",
		"RecordShelved",
		"RecordNotShelved",
	],
	views: [],
}) {}

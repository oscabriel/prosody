import * as Domain from "@alchemy.run/domain";

import { Prosody } from "./Prosody.model.ts";

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

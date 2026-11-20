import * as Domain from "@alchemy.run/domain";

import { Prosody } from "./Prosody.model.ts";

/**
 * What a reader's app may reach: the shelf, your place in each work, the nightstand, and a second
 * try at aligning a book.
 */
export class ReaderApi extends Domain.Api("ReaderApi", {
	model: Prosody,
	commands: [
		"RealignNarration",
		"KeepPlace",
		"OpenBook",
		"FinishBook",
		"SetAside",
	],
	views: ["Shelf", "Place", "Nightstand"],
}) {}

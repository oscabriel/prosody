import * as Domain from "@alchemy.run/domain";

import { Prosody } from "./Prosody.model.ts";

/**
 * What a reader's app may reach: the books you want and their offers, the shelf, your place in each
 * work, the nightstand, and a second try at aligning a book or copying one.
 */
export class ReaderApi extends Domain.Api("ReaderApi", {
	model: Prosody,
	commands: [
		"WantBook",
		"WithdrawWant",
		"SearchAgain",
		"RealignNarration",
		"RemakeCopy",
		"KeepPlace",
		"OpenBook",
		"FinishBook",
		"SetAside",
	],
	views: ["Wanted", "Shelf", "Place", "Nightstand"],
}) {}

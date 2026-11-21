import * as Domain from "@alchemy.run/domain";

import { Prosody } from "./Prosody.model.ts";

export class ReaderApi extends Domain.Api("ReaderApi", {
	model: Prosody,
	commands: [
		"WantBook",
		"WithdrawWant",
		"SearchAgain",
		"CorrectTitle",
		"GrabRelease",
		"ResumeGrab",
		"AbandonGrab",
		"ReleasePayload",
		"RealignNarration",
		"RemakeCopy",
		"KeepPlace",
		"OpenBook",
		"FinishBook",
		"SetAside",
	],
	views: ["Wanted", "Shelf", "Place", "Nightstand"],
}) {}

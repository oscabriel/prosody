import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { Session } from "../Session.middleware.ts";
import { Moment, Stage } from "./Stage.ts";

/** You put a work down for now, and it left the nightstand. Your place in it is kept. */
export class BookSetAside extends Domain.Event("BookSetAside", Moment.fields) {}

/** Only a work on the nightstand can be set aside. `stage` says where it is instead. */
export class NotReading extends Domain.Rejection(
	"NotReading",
	{ stage: Stage },
	{ httpApiStatus: 409 }
) {}

/** Take a work off the nightstand without finishing it. Opening it again puts it back. */
export class SetAside extends Domain.Command("SetAside", {
	target: WorkId,
	middleware: [Session],
	input: { at: Schema.Int },
	events: [BookSetAside],
	rejects: [NotReading],
}) {}

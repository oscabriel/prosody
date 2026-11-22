import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Forbidden, Session } from "../Session.middleware.ts";
import { ReadingId } from "./Reading.id.ts";
import { Moment, Stage } from "./Stage.ts";

export class BookSetAside extends Domain.Event("BookSetAside", Moment.fields) {}

export class NotReading extends Domain.Rejection(
	"NotReading",
	{ stage: Stage },
	{ httpApiStatus: 409 }
) {}

export class SetAside extends Domain.Command("SetAside", {
	target: ReadingId,
	middleware: [Session],
	input: { at: Schema.Int },
	events: [BookSetAside],
	rejects: [NotReading, Forbidden],
}) {}

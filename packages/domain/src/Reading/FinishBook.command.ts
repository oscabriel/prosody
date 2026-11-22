import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Forbidden, Session } from "../Session.middleware.ts";
import { ReadingId } from "./Reading.id.ts";
import { Moment } from "./Stage.ts";

export class BookFinished extends Domain.Event("BookFinished", Moment.fields) {}

export class FinishBook extends Domain.Command("FinishBook", {
	target: ReadingId,
	middleware: [Session],
	input: { at: Schema.Int },
	events: [BookFinished],
	rejects: [Forbidden],
}) {}

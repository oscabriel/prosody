import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Forbidden, Session } from "../Session.middleware.ts";
import { ReadingId } from "./Reading.id.ts";
import { Moment } from "./Stage.ts";

export class BookOpened extends Domain.Event("BookOpened", Moment.fields) {}

export class OpenBook extends Domain.Command("OpenBook", {
	target: ReadingId,
	middleware: [Session],
	input: { at: Schema.Int },
	events: [BookOpened],
	rejects: [Forbidden],
}) {}

import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { Session } from "../Session.middleware.ts";
import { Moment } from "./Stage.ts";

export class BookOpened extends Domain.Event("BookOpened", Moment.fields) {}

export class OpenBook extends Domain.Command("OpenBook", {
	target: WorkId,
	middleware: [Session],
	input: { at: Schema.Int },
	events: [BookOpened],
}) {}

import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { Session } from "../Session.middleware.ts";
import { Moment } from "./Stage.ts";

/** You finished a work, and it left the nightstand. */
export class BookFinished extends Domain.Event("BookFinished", Moment.fields) {}

/** Say you have finished a work, whether or not you read it here. */
export class FinishBook extends Domain.Command("FinishBook", {
	target: WorkId,
	middleware: [Session],
	input: { at: Schema.Int },
	events: [BookFinished],
}) {}

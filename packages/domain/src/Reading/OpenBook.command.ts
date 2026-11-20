import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { Session } from "../Session.middleware.ts";
import { Moment } from "./Stage.ts";

/** A work went on the nightstand. */
export class BookOpened extends Domain.Event("BookOpened", Moment.fields) {}

/**
 * Open a work: a device sends it when its reading room opens. A work already on the nightstand
 * stays as it is; a finished one or one set aside goes back on it.
 */
export class OpenBook extends Domain.Command("OpenBook", {
	target: WorkId,
	middleware: [Session],
	input: { at: Schema.Int },
	events: [BookOpened],
}) {}

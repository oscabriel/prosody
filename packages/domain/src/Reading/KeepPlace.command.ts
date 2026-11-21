import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { Session } from "../Session.middleware.ts";
import { KeptPlace, PlaceAt } from "./Sentence.ts";

export class PlaceKept extends Domain.Event("PlaceKept", KeptPlace.fields) {}

export class StalePlace extends Domain.Rejection(
	"StalePlace",
	{ keptAt: Schema.Int },
	{ httpApiStatus: 409 }
) {}

export class KeepPlace extends Domain.Command("KeepPlace", {
	target: WorkId,
	middleware: [Session],
	input: PlaceAt.fields,
	events: [PlaceKept],
	rejects: [StalePlace],
}) {}

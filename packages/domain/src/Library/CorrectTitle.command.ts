import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Session } from "../Session.middleware.ts";
import { NotCatalogued } from "./ShelveEdition.command.ts";
import { WorkId } from "./Work.id.ts";

/** The work's title and author, as you corrected them. */
export class TitleCorrected extends Domain.Event("TitleCorrected", {
	title: Schema.String,
	author: Schema.String,
}) {}

/** The work is on the shelf, in a folder named for it, so its name stays. */
export class OnTheShelf extends Domain.Rejection(
	"OnTheShelf",
	{},
	{ httpApiStatus: 409 }
) {}

/**
 * Correct a wanted work's title and author before it is shelved: its folder is named for them. An
 * embedded title in a file is never asked.
 */
export class CorrectTitle extends Domain.Command("CorrectTitle", {
	target: WorkId,
	input: { title: Schema.NonEmptyString, author: Schema.NonEmptyString },
	middleware: [Session],
	events: [TitleCorrected],
	rejects: [NotCatalogued, OnTheShelf],
}) {}

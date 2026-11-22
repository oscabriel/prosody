import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Forbidden, Session } from "../Session.middleware.ts";
import { NotCatalogued } from "./ShelveEdition.command.ts";
import { WorkId } from "./Work.id.ts";

export class TitleCorrected extends Domain.Event("TitleCorrected", {
	title: Schema.String,
	author: Schema.String,
}) {}

export class OnTheShelf extends Domain.Rejection(
	"OnTheShelf",
	{},
	{ httpApiStatus: 409 }
) {}

export class CorrectTitle extends Domain.Command("CorrectTitle", {
	target: WorkId,
	input: { title: Schema.NonEmptyString, author: Schema.NonEmptyString },
	middleware: [Session],
	events: [TitleCorrected],
	rejects: [NotCatalogued, OnTheShelf, Forbidden],
}) {}

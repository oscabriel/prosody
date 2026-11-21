import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { Session } from "../Session.middleware.ts";

export class BookWanted extends Domain.Event("BookWanted", {
	title: Schema.String,
	author: Schema.String,
}) {}

export class SearchStarted extends Domain.Event("SearchStarted", {
	search: Schema.Int,
}) {}

export class WantBook extends Domain.Command("WantBook", {
	target: WorkId,
	input: { title: Schema.NonEmptyString, author: Schema.NonEmptyString },
	middleware: [Session],
	events: [BookWanted, SearchStarted],
}) {}

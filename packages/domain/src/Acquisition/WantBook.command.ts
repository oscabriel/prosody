import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { Session } from "../Session.middleware.ts";

/** A book you want, by its title and author as you gave them. */
export class BookWanted extends Domain.Event("BookWanted", {
	title: Schema.String,
	author: Schema.String,
}) {}

/** The Indexer is to be searched. Each search has its own number, so a late answer to an old one is ignored. */
export class SearchStarted extends Domain.Event("SearchStarted", {
	search: Schema.Int,
}) {}

/**
 * Want a book, and search for it. Its work id is new, made by the device that asks. Wanting a book
 * you already want changes nothing.
 */
export class WantBook extends Domain.Command("WantBook", {
	target: WorkId,
	input: { title: Schema.NonEmptyString, author: Schema.NonEmptyString },
	middleware: [Session],
	events: [BookWanted, SearchStarted],
}) {}

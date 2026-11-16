import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Shelfmark } from "./Shelfmark.ts";
import { WorkId } from "./Work.id.ts";

export class WorkCatalogued extends Domain.Event("WorkCatalogued", {
	title: Schema.String,
	author: Schema.String,
	shelfmark: Shelfmark,
}) {}

/** Enter a work in the catalogue. Cataloguing it again changes nothing. */
export class CatalogueWork extends Domain.Command("CatalogueWork", {
	target: WorkId,
	input: { title: Schema.String, author: Schema.String, shelfmark: Shelfmark },
	events: [WorkCatalogued],
}) {}

import * as Domain from "@alchemy.run/domain";
import { Effect, Schema } from "effect";

import { Description } from "./Metadata.external.ts";
import { Shelfmark } from "./Shelfmark.ts";
import { WorkId } from "./Work.id.ts";

export class WorkCatalogued extends Domain.Event("WorkCatalogued", {
	title: Schema.String,
	author: Schema.String,
	/** Where it sits in the library. A work catalogued when you wanted it has none until it is shelved. */
	shelfmark: Schema.NullOr(Shelfmark),
	/** What the catalogues outside know of it. A work the press found has none, as had every work before. */
	description: Schema.NullOr(Description).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(null))
	),
}) {}

/**
 * Enter a work in the catalogue: one the press found in the library, or one you want, as the
 * catalogues outside know it. Cataloguing it again changes nothing.
 */
export class CatalogueWork extends Domain.Command("CatalogueWork", {
	target: WorkId,
	input: {
		title: Schema.String,
		author: Schema.String,
		shelfmark: Schema.NullOr(Shelfmark),
		description: Schema.NullOr(Description),
	},
	events: [WorkCatalogued],
}) {}

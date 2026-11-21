import * as Domain from "@alchemy.run/domain";
import { Effect, Schema } from "effect";

import { Description } from "./Metadata.external.ts";
import { Shelfmark } from "./Shelfmark.ts";
import { WorkId } from "./Work.id.ts";

export class WorkCatalogued extends Domain.Event("WorkCatalogued", {
	title: Schema.String,
	author: Schema.String,
	shelfmark: Schema.NullOr(Shelfmark),
	description: Schema.NullOr(Description).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(null))
	),
}) {}

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

import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "./Work.id.ts";

export const EditionKind = Schema.Literals(["text", "audio", "pages"]);

export type EditionKind = typeof EditionKind.Type;

export class EditionShelved extends Domain.Event("EditionShelved", {
	kind: EditionKind,
	file: Schema.String,
	bytes: Schema.Int,
}) {}

export class NotCatalogued extends Domain.Rejection(
	"NotCatalogued",
	{},
	{ httpApiStatus: 404 }
) {}

export class AlreadyShelved extends Domain.Rejection(
	"AlreadyShelved",
	{ kind: EditionKind, file: Schema.String },
	{ httpApiStatus: 409 }
) {}

export class ShelveEdition extends Domain.Command("ShelveEdition", {
	target: WorkId,
	input: { kind: EditionKind, file: Schema.String, bytes: Schema.Int },
	events: [EditionShelved],
	rejects: [NotCatalogued, AlreadyShelved],
}) {}
